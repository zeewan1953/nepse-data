import { execute } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Stock-wise query: all stocks for a date with broker breakdown (buy/sell/hold)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date") || todayStr();
    const symbol = sp.get("symbol") || undefined;

    // Get all trades for this date (optionally filtered by symbol)
    let trades;
    if (symbol) {
      trades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ? AND stockSymbol = ?",
        [date, symbol],
      );
    } else {
      trades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
        [date],
      );
    }

    // Aggregate stocks
    const stockMap = new Map<string, { symbol: string; name: string; qty: number; amount: number; trades: number }>();
    // Broker breakdown per stock: stockSymbol -> brokerId -> {buy, sell}
    const brokerBreakdown = new Map<string, Map<string, { buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>>();

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const buyer = String(r.buyerMemberId);
      const seller = String(r.sellerMemberId);

      const st = stockMap.get(sym) ?? { symbol: sym, name, qty: 0, amount: 0, trades: 0 };
      st.qty += qty; st.amount += amt; st.trades += 1;
      stockMap.set(sym, st);

      // Broker breakdown
      if (!brokerBreakdown.has(sym)) brokerBreakdown.set(sym, new Map());
      const bm = brokerBreakdown.get(sym)!;

      const bEntry = bm.get(buyer) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      bEntry.buyQty += qty; bEntry.buyAmt += amt;
      bm.set(buyer, bEntry);

      const sEntry = bm.get(seller) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      sEntry.sellQty += qty; sEntry.sellAmt += amt;
      bm.set(seller, sEntry);
    }

    const stocks = [...stockMap.values()].sort((a, b) => b.amount - a.amount);

    // Build broker breakdown for each stock (top brokers by net amount)
    const stockBrokers: Record<string, Array<{ id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number; action: string }>> = {};
    for (const [sym, bm] of brokerBreakdown) {
      const brokers = [...bm.values()]
        .map((b) => ({
          ...b,
          id: [...bm.entries()].find(([, v]) => v === b)?.[0] ?? "",
          netQty: b.buyQty - b.sellQty,
          netAmt: b.buyAmt - b.sellAmt,
          action: b.buyAmt > 0 && b.sellAmt > 0 ? "hold" : b.buyAmt > 0 ? "buy" : "sell",
        }))
        .sort((a, b) => b.netAmt - a.netAmt);
      // Fix: get broker ID properly
      const brokerEntries = [...bm.entries()];
      const result = brokerEntries.map(([id, b]) => ({
        id,
        buyQty: b.buyQty,
        buyAmt: b.buyAmt,
        sellQty: b.sellQty,
        sellAmt: b.sellAmt,
        netQty: b.buyQty - b.sellQty,
        netAmt: b.buyAmt - b.sellAmt,
        action: b.buyAmt > 0 && b.sellAmt > 0 ? "hold" : b.buyAmt > 0 ? "buy" : "sell",
      })).sort((a, b) => b.netAmt - a.netAmt);
      stockBrokers[sym] = result;
    }

    return Response.json({ date, stocks, stockBrokers });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
