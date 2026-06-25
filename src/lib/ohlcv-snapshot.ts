import { db } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export async function snapshotDailyOHLCV(): Promise<{ saved: number; date: string }> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail?.length) {
    return { saved: 0, date: "" };
  }

  const dateStr = mero.turnover.date.slice(0, 10).replace(/\//g, "-");

  let saved = 0;
  for (const s of mero.turnover.detail) {
    const symbol = s.s;
    const open = s.op || 0;
    const high = s.h || 0;
    const low = s.l || 0;
    const close = s.lp || 0;
    const volume = s.q || 0;
    const turnover = s.t || 0;

    try {
      await db.execute({
        sql: `INSERT INTO stock_daily_ohlcv (symbol, date, open, high, low, close, volume, turnover)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(symbol, date) DO UPDATE SET
                open = excluded.open,
                high = excluded.high,
                low = excluded.low,
                close = excluded.close,
                volume = excluded.volume,
                turnover = excluded.turnover`,
        args: [symbol, dateStr, open, high, low, close, volume, turnover],
      });
      saved++;
    } catch {
      // skip individual failures
    }
  }

  return { saved, date: dateStr };
}
