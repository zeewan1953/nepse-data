import { execute, getAvailableDates } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Today's date in YYYY-MM-DD (Nepal time)
function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Date overview: aggregate broker & stock stats from DB for a given date
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayStr();

    // Get all trades for this date
    const trades = await execute(
      "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
      [date],
    );

    if (!trades.rows.length) {
      const dates = await getAvailableDates();
      return Response.json({ date, totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 }, netFlow: [], topBuyers: [], topSellers: [], stocks: [], dates });
    }

    // Aggregate
    const brokerMap = new Map<string, { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>();
    const stockMap = new Map<string, { symbol: string; name: string; qty: number; amount: number; trades: number }>();
    let totalQty = 0, totalAmount = 0;

    const getB = (id: string) => brokerMap.get(id) ?? { id, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };

    for (const r of trades.rows) {
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const buyer = String(r.buyerMemberId);
      const seller = String(r.sellerMemberId);

      totalQty += qty;
      totalAmount += amt;

      const b = getB(buyer); b.buyQty += qty; b.buyAmt += amt; brokerMap.set(buyer, b);
      const s = getB(seller); s.sellQty += qty; s.sellAmt += amt; brokerMap.set(seller, s);

      const st = stockMap.get(sym) ?? { symbol: sym, name, qty: 0, amount: 0, trades: 0 };
      st.qty += qty; st.amount += amt; st.trades += 1;
      stockMap.set(sym, st);
    }

    const brokerList = [...brokerMap.values()].map((b) => ({
      ...b, netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt,
    }));

    const dates = await getAvailableDates();

    return Response.json({
      date,
      totals: { trades: trades.rows.length, qty: totalQty, amount: totalAmount, brokers: brokerMap.size, stocks: stockMap.size },
      netFlow: [...brokerList].sort((a, b) => b.netAmt - a.netAmt),
      topBuyers: [...brokerList].sort((a, b) => b.buyAmt - a.buyAmt).slice(0, 10),
      topSellers: [...brokerList].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, 10),
      stocks: [...stockMap.values()].sort((a, b) => b.amount - a.amount),
      dates,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
