import { execute, getAvailableDates } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Calculate accumulation/distribution for a specific date
// Acc/Dist = Buy Amount - Sell Amount per stock
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date") || todayStr();

    // Get all trades for this date
    const trades = await execute(
      "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
      [date],
    );

    if (!trades.rows.length) {
      const dates = await getAvailableDates();
      return Response.json({ date, stocks: [], trend: [], dates, error: "No data for this date" });
    }

    // Calculate accumulation/distribution per stock
    // Track buyer and seller separately
    const stockMap = new Map<string, {
      symbol: string;
      name: string;
      buyAmt: number;
      sellAmt: number;
      buyQty: number;
      sellQty: number;
      trades: number;
    }>();

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);

      // Get or create entry
      let s = stockMap.get(sym);
      if (!s) {
        s = { symbol: sym, name, buyAmt: 0, sellAmt: 0, buyQty: 0, sellQty: 0, trades: 0 };
        stockMap.set(sym, s);
      }

      // Buyer side - add to buy
      s.buyAmt += amt;
      s.buyQty += qty;
      s.trades += 1;

      // Seller side - add to sell
      s.sellAmt += amt;
      s.sellQty += qty;
    }

    // Calculate net flow (accumulation - distribution)
    const stocks = [...stockMap.values()]
      .map((s) => ({
        ...s,
        netFlow: s.buyAmt - s.sellAmt,
        netQty: s.buyQty - s.sellQty,
        avgPrice: s.buyQty > 0 ? s.buyAmt / s.buyQty : 0,
        signal: s.buyAmt > s.sellAmt * 1.2 ? "ACCUMULATION" : s.sellAmt > s.buyAmt * 1.2 ? "DISTRIBUTION" : "NEUTRAL",
      }))
      .sort((a, b) => b.netFlow - a.netFlow);

    // Get 7-day trend
    const dates = await getAvailableDates();
    const sortedDates = dates.sort().reverse();
    const dateIndex = sortedDates.indexOf(date);
    const trendDates = sortedDates.slice(Math.max(0, dateIndex - 6), dateIndex + 1).reverse();

    const trend = [];
    for (const d of trendDates) {
      const dayTrades = await execute(
        "SELECT stockSymbol, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
        [d],
      );
      if (dayTrades.rows.length) {
        let totalBuy = 0, totalSell = 0;
        for (const t of dayTrades.rows) {
          totalBuy += Number(t.contractAmount);
        }
        trend.push({ date: d, turnover: totalBuy, trades: dayTrades.rows.length });
      }
    }

    return Response.json({
      date,
      stocks,
      trend,
      dates,
      totals: {
        totalAccumulation: stocks.filter((s) => s.netFlow > 0).reduce((sum, s) => sum + s.netFlow, 0),
        totalDistribution: Math.abs(stocks.filter((s) => s.netFlow < 0).reduce((sum, s) => sum + s.netFlow, 0)),
        accumulated: stocks.filter((s) => s.signal === "ACCUMULATION").length,
        distributed: stocks.filter((s) => s.signal === "DISTRIBUTION").length,
        neutral: stocks.filter((s) => s.signal === "NEUTRAL").length,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
