import { execute, getAvailableDates } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calculate accumulation/distribution for a specific date
// For each stock, tracks per-broker buy/sell to identify net imbalances
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const { date } = await getTargetDateWithFallback(dateParam || undefined);

    const trades = await execute(
      "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
      [date],
    );

    if (!trades.rows.length) {
      const dates = await getAvailableDates();
      return Response.json({ date, stocks: [], trend: [], dates, error: "No data for this date" });
    }

    // Track per-broker-per-stock: { stock -> { broker -> { buyAmt, sellAmt } } }
    const stockBrokerMap = new Map<string, Map<string, { buyAmt: number; sellAmt: number; buyQty: number; sellQty: number }>>();
    const stockMeta = new Map<string, { name: string }>();

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const buyer = String(r.buyerMemberId);
      const seller = String(r.sellerMemberId);

      if (!stockMeta.has(sym)) stockMeta.set(sym, { name });

      // Update buyer's side
      let brokerMap = stockBrokerMap.get(sym);
      if (!brokerMap) { brokerMap = new Map(); stockBrokerMap.set(sym, brokerMap); }
      let bEntry = brokerMap.get(buyer);
      if (!bEntry) { bEntry = { buyAmt: 0, sellAmt: 0, buyQty: 0, sellQty: 0 }; brokerMap.set(buyer, bEntry); }
      bEntry.buyAmt += amt;
      bEntry.buyQty += qty;

      // Update seller's side
      let sEntry = brokerMap.get(seller);
      if (!sEntry) { sEntry = { buyAmt: 0, sellAmt: 0, buyQty: 0, sellQty: 0 }; brokerMap.set(seller, sEntry); }
      sEntry.sellAmt += amt;
      sEntry.sellQty += qty;
    }

    // For each stock, compute net flow and signal
    const stocks = [...stockBrokerMap.entries()].map(([symbol, brokerMap]) => {
      const meta = stockMeta.get(symbol)!;
      let totalBuyAmt = 0, totalSellAmt = 0;
      let totalBuyQty = 0, totalSellQty = 0;
      let maxNetBuy = 0, maxNetSell = 0;
      let topBuyer = "", topSeller = "";
      let netBuyerCount = 0, netSellerCount = 0;

      for (const [broker, entry] of brokerMap) {
        totalBuyAmt += entry.buyAmt;
        totalSellAmt += entry.sellAmt;
        totalBuyQty += entry.buyQty;
        totalSellQty += entry.sellQty;
        const net = entry.buyAmt - entry.sellAmt;
        if (net > maxNetBuy) { maxNetBuy = net; topBuyer = broker; }
        if (net < maxNetSell) { maxNetSell = net; topSeller = broker; }
        if (net > 0) netBuyerCount++;
        if (net < 0) netSellerCount++;
      }

      const totalValue = totalBuyAmt + totalSellAmt;
      const maxImbalance = Math.max(Math.abs(maxNetBuy), Math.abs(maxNetSell));
      const imbalanceRatio = totalValue > 0 ? maxImbalance / totalValue : 0;
      const breadthRatio = netSellerCount > 0 ? netBuyerCount / netSellerCount : 0;

      // ACCUMULATION: dominant buyer is significantly larger than dominant seller
      // OR many more net buyers than net sellers
      let signal: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
      if (imbalanceRatio > 0.08 && maxNetBuy > Math.abs(maxNetSell) * 1.15) {
        signal = "ACCUMULATION";
      } else if (imbalanceRatio > 0.08 && Math.abs(maxNetSell) > maxNetBuy * 1.15) {
        signal = "DISTRIBUTION";
      } else if (breadthRatio >= 2 && maxNetBuy > 0) {
        signal = "ACCUMULATION";
      } else if (breadthRatio <= 0.5 && Math.abs(maxNetSell) > 0) {
        signal = "DISTRIBUTION";
      } else {
        signal = "NEUTRAL";
      }

      return {
        symbol,
        name: meta.name,
        buyAmt: totalBuyAmt,
        sellAmt: totalSellAmt,
        buyQty: totalBuyQty,
        sellQty: totalSellQty,
        netFlow: totalBuyAmt - totalSellAmt,
        netQty: totalBuyQty - totalSellQty,
        avgPrice: totalBuyQty > 0 ? totalBuyAmt / totalBuyQty : 0,
        signal,
        topBuyer,
        topSeller,
      };
    }).sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt));

    // Get 7-day trend
    const dates = await getAvailableDates();
    const sortedDates = dates.sort().reverse();
    const dateIndex = sortedDates.indexOf(date);
    const trendDates = sortedDates.slice(Math.max(0, dateIndex - 6), dateIndex + 1).reverse();

    const trend = [];
    for (const d of trendDates) {
      const dayTrades = await execute(
        "SELECT contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
        [d],
      );
      if (dayTrades.rows.length) {
        let total = 0;
        for (const t of dayTrades.rows) {
          total += Number(t.contractAmount);
        }
        trend.push({ date: d, turnover: total, trades: dayTrades.rows.length });
      }
    }

    return Response.json({
      date,
      stocks,
      trend,
      dates,
      totals: {
        totalAccumulation: stocks.filter((s) => s.signal === "ACCUMULATION").length,
        totalDistribution: stocks.filter((s) => s.signal === "DISTRIBUTION").length,
        accumulated: stocks.filter((s) => s.signal === "ACCUMULATION").length,
        distributed: stocks.filter((s) => s.signal === "DISTRIBUTION").length,
        neutral: stocks.filter((s) => s.signal === "NEUTRAL").length,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
