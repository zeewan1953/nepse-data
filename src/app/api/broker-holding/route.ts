import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tryFinCol(query: string, args?: unknown[]) {
  try {
    return await db.execute({ sql: query.replace(" AND finalized = 1", "").replace("WHERE finalized = 1 AND ", "WHERE ").replace("WHERE finalized = 1", ""), args });
  } catch { return { rows: [] }; }
}

function findFin(query: string): string {
  return query.replace(" AND finalized = 1", "").replace("WHERE finalized = 1 AND ", "WHERE ").replace("WHERE finalized = 1", "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return Response.json({ error: "date query param is required" }, { status: 400 });
  }

  // Check if any data exists for this date
  let hasFinCol = true;
  try {
    await db.execute({ sql: "SELECT finalized FROM broker_daily_agg LIMIT 1" });
  } catch { hasFinCol = false; }

  const finFilter = (sql: string) => hasFinCol ? sql : findFin(sql);

  const anyResult = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = ?",
    args: [date],
  });
  const anyCount = Number(anyResult.rows[0]?.cnt ?? 0);
  if (anyCount === 0) {
    const result = await db.execute({
      sql: "SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate DESC LIMIT 1",
    });
    return Response.json({
      date, status: "empty", message: "No data for this date",
      latestDate: result.rows[0]?.tradeDate ?? null,
      brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0,
    });
  }

  // Get per-broker aggregates for the date
  const aggResult = await db.execute({
    sql: finFilter(`SELECT brokerId, SUM(buyAmt) as buyAmt, SUM(sellAmt) as sellAmt, SUM(netAmt) as netAmt
          FROM broker_daily_agg WHERE tradeDate = ?
          GROUP BY brokerId ORDER BY ABS(SUM(netAmt)) DESC`),
    args: [date],
  });

  if (aggResult.rows.length === 0) {
    return Response.json({ date, status: "empty", brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 });
  }

  // Compute cumulative net for each broker from earliest tracked date
  const startSql = finFilter("SELECT MIN(tradeDate) as d FROM broker_daily_agg WHERE finalized = 1");
  const earliestDateResult = await db.execute({ sql: startSql });
  const earliestDate = String(earliestDateResult.rows[0]?.d ?? date);

  const cumSql = finFilter(`SELECT brokerId, SUM(netAmt) as cumulativeNet
          FROM broker_daily_agg WHERE tradeDate >= ? AND tradeDate <= ? AND finalized = 1
          GROUP BY brokerId`);
  const cumResult = await db.execute({ sql: cumSql, args: [earliestDate, date] });

  const cumMap = new Map<string, number>();
  for (const row of cumResult.rows) {
    cumMap.set(String(row.brokerId), Number(row.cumulativeNet));
  }

  // Build response
  const maxAbsNet = Math.max(...aggResult.rows.map((r) => Math.abs(Number(r.netAmt))), 1);
  let totalBuyAmt = 0, totalSellAmt = 0, totalNetAmt = 0;

  const brokers = aggResult.rows.map((row, idx) => {
    const brokerId = String(row.brokerId);
    const buyAmt = Number(row.buyAmt);
    const sellAmt = Number(row.sellAmt);
    const netAmt = Number(row.netAmt);
    const cumulativeNet = cumMap.get(brokerId) ?? null;

    totalBuyAmt += buyAmt;
    totalSellAmt += sellAmt;
    totalNetAmt += netAmt;

    let holdingPct: number | null = null;
    let note: string | null = null;

    if (cumulativeNet !== null) {
      holdingPct = Math.round((Math.abs(cumulativeNet) / maxAbsNet) * 100);
    } else {
      note = null; // first day of tracking
    }

    return {
      brokerId,
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: cumulativeNet !== null ? Math.round(cumulativeNet * 100) / 100 : null,
      holdingPct, note, rank: idx + 1,
    };
  });

  return Response.json({
    date, status: "finalized", brokers,
    totalBuyAmt: Math.round(totalBuyAmt * 100) / 100,
    totalSellAmt: Math.round(totalSellAmt * 100) / 100,
    totalNetAmt: Math.round(totalNetAmt * 100) / 100,
  });
}
