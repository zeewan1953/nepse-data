import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return Response.json({ error: "date query param is required" }, { status: 400 });
  }

  // Check if data is finalized for this date
  let isFinalized = true;
  try {
    const finResult = await db.execute({
      sql: "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = ? AND finalized = 1",
      args: [date],
    });
    const finalizedCount = Number(finResult.rows[0]?.cnt ?? 0);
    if (finalizedCount === 0) {
      const anyResult = await db.execute({
        sql: "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = ?",
        args: [date],
      });
      const anyCount = Number(anyResult.rows[0]?.cnt ?? 0);
      if (anyCount === 0) {
        const result = await db.execute({
          sql: "SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate DESC LIMIT 1",
        });
        const latestDate = result.rows[0]?.tradeDate ?? null;
        return Response.json({
          date,
          status: "empty",
          message: "No data for this date",
          latestDate,
          brokers: [],
          totalBuyAmt: 0,
          totalSellAmt: 0,
          totalNetAmt: 0,
        });
      }
      isFinalized = false;
    }
  } catch {
    // finalized column may not exist; treat all data as finalized
    isFinalized = true;
  }

  if (!isFinalized) {
    return Response.json({
      date,
      status: "pending",
      message: "Awaiting finalization (post-market)",
      brokers: [],
      totalBuyAmt: 0,
      totalSellAmt: 0,
      totalNetAmt: 0,
    });
  }

  // Get per-broker aggregates for the date
  const aggResult = await db.execute({
    sql: `SELECT brokerId,
                 SUM(buyAmt) as buyAmt,
                 SUM(sellAmt) as sellAmt,
                 SUM(netAmt) as netAmt
          FROM broker_daily_agg
          WHERE tradeDate = ?
          GROUP BY brokerId
          ORDER BY ABS(SUM(netAmt)) DESC`,
    args: [date],
  });

  if (aggResult.rows.length === 0) {
    return Response.json({ date, status: "empty", brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 });
  }

  // Compute cumulative net for each broker from earliest tracked date
  const earliestDateResult = await db.execute({
    sql: "SELECT MIN(tradeDate) as d FROM broker_daily_agg WHERE finalized = 1",
  });
  const earliestDate = String(earliestDateResult.rows[0]?.d ?? date);

  const cumResult = await db.execute({
    sql: `SELECT brokerId, SUM(netAmt) as cumulativeNet
          FROM broker_daily_agg
          WHERE tradeDate >= ? AND tradeDate <= ? AND finalized = 1
          GROUP BY brokerId`,
    args: [earliestDate, date],
  });

  const cumMap = new Map<string, number>();
  for (const row of cumResult.rows) {
    cumMap.set(String(row.brokerId), Number(row.cumulativeNet));
  }

  // Check for gaps > 5 trading days
  const gapResult = await db.execute({
    sql: `SELECT brokerId,
                 COUNT(DISTINCT tradeDate) as tradingDays,
                 MIN(tradeDate) as firstDate,
                 MAX(tradeDate) as lastDate
          FROM broker_daily_agg
          WHERE finalized = 1 AND brokerId IN (${aggResult.rows.map(() => "?").join(",")})
          GROUP BY brokerId`,
    args: aggResult.rows.map((r) => String(r.brokerId)),
  });

  const gapInfo = new Map<string, { tradingDays: number; lastDate: string }>();
  for (const row of gapResult.rows) {
    gapInfo.set(String(row.brokerId), {
      tradingDays: Number(row.tradingDays),
      lastDate: String(row.lastDate),
    });
  }

  // Build response
  const maxAbsNet = Math.max(...aggResult.rows.map((r) => Math.abs(Number(r.netAmt))), 1);
  let totalBuyAmt = 0;
  let totalSellAmt = 0;
  let totalNetAmt = 0;

  const brokers = aggResult.rows.map((row, idx) => {
    const brokerId = String(row.brokerId);
    const buyAmt = Number(row.buyAmt);
    const sellAmt = Number(row.sellAmt);
    const netAmt = Number(row.netAmt);
    const cumulativeNet = cumMap.get(brokerId) ?? null;
    const gap = gapInfo.get(brokerId);

    totalBuyAmt += buyAmt;
    totalSellAmt += sellAmt;
    totalNetAmt += netAmt;

    let holdingPct: number | null = null;
    let note: string | null = null;

    if (cumulativeNet !== null) {
      if (gap && gap.tradingDays < 2) {
        note = "insufficient data";
      } else {
        holdingPct = Math.round((Math.abs(cumulativeNet) / maxAbsNet) * 100);
      }
    } else {
      note = "insufficient data";
    }

    // Validate: netAmt should equal buyAmt - sellAmt within floating point tolerance
    const expectedNet = buyAmt - sellAmt;
    const isValid = Math.abs(netAmt - expectedNet) <= 1;

    return {
      brokerId,
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: cumulativeNet !== null ? Math.round(cumulativeNet * 100) / 100 : null,
      holdingPct,
      note,
      rank: idx + 1,
      validated: isValid,
    };
  });

  return Response.json({
    date,
    status: "finalized",
    brokers,
    totalBuyAmt: Math.round(totalBuyAmt * 100) / 100,
    totalSellAmt: Math.round(totalSellAmt * 100) / 100,
    totalNetAmt: Math.round(totalNetAmt * 100) / 100,
  });
}
