import { execute } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Broker-wise query: all stocks traded by a specific broker on a date or date range
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    
    let date: string;
    let rangeMode = false;

    if (fromParam && toParam) {
      date = `${fromParam} – ${toParam}`;
      rangeMode = true;
    } else {
      const fallback = await getTargetDateWithFallback(dateParam || undefined);
      date = fallback.date;
    }

    const broker = sp.get("broker");
    if (!broker) return Response.json({ error: "Missing broker param" }, { status: 400 });

    const trades = await (rangeMode
      ? execute(
          "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ? AND (buyerMemberId = ? OR sellerMemberId = ?)",
          [fromParam!, toParam!, broker, broker],
        )
      : execute(
          "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ? AND (buyerMemberId = ? OR sellerMemberId = ?)",
          [date, broker, broker],
        )
    );

    // Fallback: MeroLagani for broker aggregate (no per-stock data)
    if (!trades.rows.length) {
      const mero = await fetchMeroLaganiSummary();
      if (mero?.broker?.detail?.length) {
        const match = mero.broker.detail.find((b) => b.b === broker);
        if (match) {
          const buyAmt = Number(match.p) || 0;
          const sellAmt = Number(match.s) || 0;
          return Response.json({
            date, source: "merolagani", broker,
            stocks: [],
            totals: { buyAmt, sellAmt, netAmt: buyAmt - sellAmt, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0, buyTrades: 0, sellTrades: 0 },
          });
        }
      }
    }

    // Aggregate per stock
    const stockMap = new Map<string, { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; buyTrades: number; sellTrades: number }>();
    let totalBuyAmt = 0, totalSellAmt = 0, totalBuyQty = 0, totalSellQty = 0, totalBuyTrades = 0, totalSellTrades = 0;

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const isBuy = String(r.buyerMemberId) === broker;

      const s = stockMap.get(sym) ?? { symbol: sym, name, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, buyTrades: 0, sellTrades: 0 };
      if (isBuy) { s.buyQty += qty; s.buyAmt += amt; s.buyTrades += 1; totalBuyQty += qty; totalBuyAmt += amt; totalBuyTrades += 1; }
      else { s.sellQty += qty; s.sellAmt += amt; s.sellTrades += 1; totalSellQty += qty; totalSellAmt += amt; totalSellTrades += 1; }
      stockMap.set(sym, s);
    }

    const stocks = [...stockMap.values()]
      .map((s) => ({
        ...s,
        netQty: s.buyQty - s.sellQty,
        netAmt: s.buyAmt - s.sellAmt,
        avgBuyPrice: s.buyQty > 0 ? s.buyAmt / s.buyQty : 0,
        avgSellPrice: s.sellQty > 0 ? s.sellAmt / s.sellQty : 0,
        aggressive: s.buyAmt > 0 && s.sellAmt === 0 ? "buy" : s.sellAmt > 0 && s.buyAmt === 0 ? "sell" : "mixed",
      }))
      .sort((a, b) => b.netAmt - a.netAmt);

    return Response.json({
      date,
      broker,
      stocks,
      totals: {
        buyAmt: totalBuyAmt, sellAmt: totalSellAmt, netAmt: totalBuyAmt - totalSellAmt,
        buyQty: totalBuyQty, sellQty: totalSellQty,
        avgBuyPrice: totalBuyQty > 0 ? totalBuyAmt / totalBuyQty : 0,
        avgSellPrice: totalSellQty > 0 ? totalSellAmt / totalSellQty : 0,
        buyTrades: totalBuyTrades, sellTrades: totalSellTrades,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
