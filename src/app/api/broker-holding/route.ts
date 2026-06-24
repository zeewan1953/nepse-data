import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return Response.json({ error: "date query param is required" }, { status: 400 });
  }

  // Check finalized column exists
  let hasFin = true;
  try { await db.execute("SELECT finalized FROM broker_daily_agg LIMIT 1"); } catch { hasFin = false; }
  const fin = (s: string) => hasFin ? s : s.replace(/AND finalized\s*=\s*\d+/g, "").replace(/WHERE finalized\s*=\s*\d+/g, "");

  const anyResult = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = ?", args: [date] });
  if (Number(anyResult.rows[0]?.cnt ?? 0) === 0) {
    const r = await db.execute("SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate DESC LIMIT 1");
    return Response.json({ date, status: "empty", message: "No data for this date", latestDate: r.rows[0]?.tradeDate ?? null, brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 });
  }

  const aggResult = await db.execute({
    sql: `SELECT brokerId, SUM(buyAmt) as buyAmt, SUM(sellAmt) as sellAmt, SUM(netAmt) as netAmt FROM broker_daily_agg WHERE tradeDate = ? GROUP BY brokerId ORDER BY ABS(SUM(netAmt)) DESC`,
    args: [date],
  });
  if (aggResult.rows.length === 0) {
    return Response.json({ date, status: "empty", brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 });
  }

  const edr = await db.execute({ sql: fin("SELECT MIN(tradeDate) as d FROM broker_daily_agg WHERE finalized = 1") });
  const earliestDate = String(edr.rows[0]?.d ?? date);
  const cumResult = await db.execute({ sql: fin("SELECT brokerId, SUM(netAmt) as cumulativeNet FROM broker_daily_agg WHERE tradeDate >= ? AND tradeDate <= ? AND finalized = 1 GROUP BY brokerId"), args: [earliestDate, date] });

  const cumMap = new Map<string, number>();
  for (const row of cumResult.rows) cumMap.set(String(row.brokerId), Number(row.cumulativeNet));

  const maxAbsNet = Math.max(...aggResult.rows.map((r) => Math.abs(Number(r.netAmt))), 1);
  let totalBuyAmt = 0, totalSellAmt = 0, totalNetAmt = 0;

  const brokers = aggResult.rows.map((row, idx) => {
    const brokerId = String(row.brokerId), buyAmt = Number(row.buyAmt), sellAmt = Number(row.sellAmt), netAmt = Number(row.netAmt);
    const cumulativeNet = cumMap.get(brokerId) ?? null;
    totalBuyAmt += buyAmt; totalSellAmt += sellAmt; totalNetAmt += netAmt;
    return {
      brokerId,
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: cumulativeNet !== null ? Math.round(cumulativeNet * 100) / 100 : null,
      holdingPct: cumulativeNet !== null ? Math.round((Math.abs(cumulativeNet) / maxAbsNet) * 100) : null,
      note: null,
      rank: idx + 1,
    };
  });

  return Response.json({ date, status: "finalized", brokers, totalBuyAmt: Math.round(totalBuyAmt * 100) / 100, totalSellAmt: Math.round(totalSellAmt * 100) / 100, totalNetAmt: Math.round(totalNetAmt * 100) / 100 });
}
