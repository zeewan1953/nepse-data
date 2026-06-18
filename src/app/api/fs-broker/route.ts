import { execute } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Broker-wise query: all stocks traded by a specific broker on a date
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date") || todayStr();
    const broker = sp.get("broker");
    if (!broker) return Response.json({ error: "Missing broker param" }, { status: 400 });

    // Fetch all trades where this broker is buyer or seller
    const trades = await execute(
      "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ? AND (buyerMemberId = ? OR sellerMemberId = ?)",
      [date, broker, broker],
    );

    // Aggregate per stock
    const stockMap = new Map<string, { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>();
    let totalBuyAmt = 0, totalSellAmt = 0, totalBuyQty = 0, totalSellQty = 0;

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const isBuy = String(r.buyerMemberId) === broker;

      const s = stockMap.get(sym) ?? { symbol: sym, name, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      if (isBuy) { s.buyQty += qty; s.buyAmt += amt; totalBuyQty += qty; totalBuyAmt += amt; }
      else { s.sellQty += qty; s.sellAmt += amt; totalSellQty += qty; totalSellAmt += amt; }
      stockMap.set(sym, s);
    }

    const stocks = [...stockMap.values()]
      .map((s) => ({ ...s, netQty: s.buyQty - s.sellQty, netAmt: s.buyAmt - s.sellAmt }))
      .sort((a, b) => b.netAmt - a.netAmt);

    return Response.json({
      date,
      broker,
      stocks,
      totals: { buyAmt: totalBuyAmt, sellAmt: totalSellAmt, netAmt: totalBuyAmt - totalSellAmt, buyQty: totalBuyQty, sellQty: totalSellQty },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
