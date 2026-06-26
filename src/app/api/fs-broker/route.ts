import { execute } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    let rangeMode = false;

    let date: string;
    if (fromParam && toParam) {
      date = `${fromParam} – ${toParam}`;
      rangeMode = true;
    } else {
      const fallback = await getTargetDateWithFallback(dateParam || undefined);
      date = fallback.date;
    }

    const broker = sp.get("broker");
    if (!broker) return Response.json({ error: "Missing broker param" }, { status: 400 });

    if (rangeMode) {
      // Range: aggregate from MeroLagani DB
      const rows = await execute(
        `SELECT tradeDate, purchaseAmt, sellAmt, netAmt, totalAmt
         FROM merolagani_broker_daily WHERE brokerCode = ? AND tradeDate >= ? AND tradeDate <= ?
         ORDER BY tradeDate`,
        [broker, fromParam!, toParam!],
      );
      if (!rows.rows.length) {
        return Response.json({
          date, source: "merolagani", broker,
          stocks: [],
          totals: { buyAmt: 0, sellAmt: 0, netAmt: 0, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0, buyTrades: 0, sellTrades: 0 },
        });
      }
      const totals = rows.rows.reduce((a: any, r: any) => ({
        buyAmt: a.buyAmt + Number(r.purchaseAmt),
        sellAmt: a.sellAmt + Number(r.sellAmt),
        netAmt: a.netAmt + Number(r.netAmt),
      }), { buyAmt: 0, sellAmt: 0, netAmt: 0 });
      return Response.json({
        date, source: "merolagani", broker,
        stocks: [],
        totals: { ...totals, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0, buyTrades: 0, sellTrades: 0 },
        note: "Per-stock breakdown not available from MeroLagani",
      });
    }

    // Single date: try MeroLagani DB
    const meroRow = await execute(
      "SELECT purchaseAmt, sellAmt, netAmt FROM merolagani_broker_daily WHERE tradeDate = ? AND brokerCode = ?",
      [date, broker],
    );
    if (meroRow.rows.length) {
      const r = meroRow.rows[0] as any;
      const buyAmt = Number(r.purchaseAmt);
      const sellAmt = Number(r.sellAmt);
      return Response.json({
        date, source: "merolagani", broker,
        stocks: [],
        totals: { buyAmt, sellAmt, netAmt: buyAmt - sellAmt, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0, buyTrades: 0, sellTrades: 0 },
        note: "Per-stock breakdown not available from MeroLagani",
      });
    }

    // Fallback: live MeroLagani
    const mero = await fetchMeroLaganiSummary();
    if (mero?.broker?.detail?.length) {
      const match = mero.broker.detail.find((b: any) => b.b === broker);
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

    return Response.json({
      date, source: "merolagani", broker,
      stocks: [],
      totals: { buyAmt: 0, sellAmt: 0, netAmt: 0, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0, buyTrades: 0, sellTrades: 0 },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
