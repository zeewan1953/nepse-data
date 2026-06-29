import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;

    // Find the latest date with OHLCV data
    let targetDate = date;
    if (!targetDate) {
      const latest = await execute(
        `SELECT tradeDate FROM stock_daily_ohlcv ORDER BY tradeDate DESC LIMIT 1`
      );
      if (latest.rows.length === 0) {
        return NextResponse.json({ date: null, sectors: [] });
      }
      targetDate = String((latest.rows[0] as any).tradeDate).replace(/ .*$/, "");
    }

    // Compute per-sector aggregates from OHLCV + sector mapping
    const rows = await execute(
      `SELECT
         m.sector,
         COUNT(*)                                          AS stock_count,
         ROUND(SUM(o.value), 2)                            AS total_turnover,
         ROUND(
           SUM(((o.close - o.open) / NULLIF(o.open, 0)) * 100 * o.value)
           / NULLIF(SUM(o.value), 0),
           2
         )                                                 AS avg_pct_change,
         MAX((o.close - o.open) / NULLIF(o.open, 0)) * 100 AS max_pct_change,
         MIN((o.close - o.open) / NULLIF(o.open, 0)) * 100 AS min_pct_change
       FROM stock_daily_ohlcv o
       JOIN stock_sector_mapping m ON o.symbol = m.symbol
       WHERE o.tradeDate LIKE ? || '%'
         AND o.open > 0
       GROUP BY m.sector
       ORDER BY total_turnover DESC`,
      [targetDate]
    );

    // For top gainer/loser, fetch per symbol
    const gainers = await execute(
      `SELECT m.sector, o.symbol,
              ROUND(((o.close - o.open) / NULLIF(o.open, 0)) * 100, 2) AS pct_change
       FROM stock_daily_ohlcv o
       JOIN stock_sector_mapping m ON o.symbol = m.symbol
       WHERE o.tradeDate LIKE ? || '%' AND o.open > 0
       ORDER BY pct_change DESC`,
      [targetDate]
    );
    const gainerMap = new Map<string, { symbol: string; pctChange: number }>();
    for (const r of gainers.rows as any[]) {
      if (!gainerMap.has(r.sector)) {
        gainerMap.set(r.sector, { symbol: r.symbol, pctChange: r.pct_change });
      }
    }

    const losers = await execute(
      `SELECT m.sector, o.symbol,
              ROUND(((o.close - o.open) / NULLIF(o.open, 0)) * 100, 2) AS pct_change
       FROM stock_daily_ohlcv o
       JOIN stock_sector_mapping m ON o.symbol = m.symbol
       WHERE o.tradeDate LIKE ? || '%' AND o.open > 0
       ORDER BY pct_change ASC`,
      [targetDate]
    );
    const loserMap = new Map<string, { symbol: string; pctChange: number }>();
    for (const r of losers.rows as any[]) {
      if (!loserMap.has(r.sector)) {
        loserMap.set(r.sector, { symbol: r.symbol, pctChange: r.pct_change });
      }
    }

    const sectors = (rows.rows as any[]).map(r => ({
      sector: r.sector,
      stockCount: r.stock_count,
      totalTurnover: r.total_turnover,
      avgPctChange: r.avg_pct_change,
      topGainer: gainerMap.get(r.sector) ?? null,
      topLoser: loserMap.get(r.sector) ?? null,
    }));

    return NextResponse.json({ date: targetDate, sectors });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
