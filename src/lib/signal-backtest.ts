import "server-only";
import { db, execute, one } from "./db";
import { getTradingDays } from "./date-utils";

const SIGNAL_NAMES = [
  "momentum_score",
  "smart_money_score",
  "volume_zscore",
  "cmf",
  "mfi",
  "order_flow_est",
  "divergence_flag",
  "net_broker_flow",
] as const;

const HORIZONS = [1, 3, 5, 10, 20];

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002";
}

// ─── Daily Snapshot ─────────────────────────────────────────────────────────

export async function captureDailySnapshot(): Promise<{ inserted: number; date: string }> {
  const dateStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }))
    .toISOString().slice(0, 10);
  const now = Date.now();
  let inserted = 0;

  // Fetch signals from stock-wise (CMF, MFI, volumeZScore, order flow)
  let stockWiseData: any[] = [];
  try {
    const res = await fetch(`${getBaseUrl()}/api/stock-wise?date=${dateStr}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      stockWiseData = json.stocks || json;
      if (!Array.isArray(stockWiseData)) stockWiseData = [];
    }
  } catch {}

  // Fetch tactical signals (momentumScore, smartMoneyScore, divergenceFlag)
  let signalsData: { sectors?: any[]; signals?: any[] } = {};
  try {
    const res = await fetch(`${getBaseUrl()}/api/signals`, { cache: "no-store" });
    if (res.ok) signalsData = await res.json();
  } catch {}

  // Flatten tactical signals into a lookup: symbol -> { momentumScore, smartMoneyScore, divergenceFlag }
  const tacticalMap = new Map<string, any>();
  const allSignals = signalsData.signals || [];
  for (const s of allSignals) {
    tacticalMap.set(s.symbol, s);
  }

  for (const row of stockWiseData) {
    const symbol = row.symbol;
    if (!symbol) continue;
    const tactical = tacticalMap.get(symbol);

    const signals: Array<{ name: string; value: number | null }> = [
      { name: "cmf", value: row.cmf ?? null },
      { name: "mfi", value: row.mfi ?? null },
      { name: "volume_zscore", value: row.volumeZScore ?? null },
      { name: "order_flow_est", value: row.estNetVolume ?? null },
    ];

    if (tactical) {
      signals.push(
        { name: "momentum_score", value: tactical.momentumScore ?? null },
        { name: "smart_money_score", value: tactical.smartMoneyScore ?? null },
        { name: "divergence_flag", value: tactical.divergenceFlag ?? null },
      );
    }

    for (const sig of signals) {
      try {
        await execute(
          `INSERT OR IGNORE INTO signal_daily_snapshot (trade_date, symbol, signal_name, signal_value, computed_at)
           VALUES (?, ?, ?, ?, ?)`,
          [dateStr, symbol, sig.name, sig.value, now]
        );
        inserted++;
      } catch {}
    }
  }

  // Fetch broker net flow for each stock
  try {
    const flowRes = await fetch(`${getBaseUrl()}/api/broker-flow/stocks?date=${dateStr}`, { cache: "no-store" });
    if (flowRes.ok) {
      const flowData = await flowRes.json();
      const items = flowData.stocks || flowData;
      if (Array.isArray(items)) {
        for (const item of items) {
          try {
            await execute(
              `INSERT OR IGNORE INTO signal_daily_snapshot (trade_date, symbol, signal_name, signal_value, computed_at)
               VALUES (?, ?, 'net_broker_flow', ?, ?)`,
              [dateStr, item.symbol, item.netAmt ?? null, now]
            );
            inserted++;
          } catch {}
        }
      }
    }
  } catch {}

  return { inserted, date: dateStr };
}

// ─── Backtest Computation ───────────────────────────────────────────────────

export async function computeBacktest(windowDays = 180): Promise<{ computed: number }> {
  const now = Date.now();
  const npt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const windowEnd = npt.toISOString().slice(0, 10);

  // Window start = windowDays ago (calendar), then find nearest trading day
  const startDate = new Date(npt);
  startDate.setDate(startDate.getDate() - windowDays);
  const windowStart = startDate.toISOString().slice(0, 10);

  const tradingDays = getTradingDays(windowStart, windowEnd);
  if (tradingDays.length < 30) return { computed: 0 }; // not enough data

  let computed = 0;

  for (const signalName of SIGNAL_NAMES) {
    // Fetch all snapshot values in the window with non-null signal_value
    const snapshotRows = await execute(
      `SELECT trade_date, symbol, signal_value FROM signal_daily_snapshot
       WHERE signal_name = ? AND trade_date >= ? AND trade_date <= ? AND signal_value IS NOT NULL
       ORDER BY trade_date`,
      [signalName, windowStart, windowEnd]
    );

    if (snapshotRows.rows.length < 30) continue; // skip low-confidence

    for (const horizon of HORIZONS) {
      const results = await computeHorizonMetrics(signalName, snapshotRows.rows as any[], tradingDays, horizon);
      if (!results || results.sampleSize < 30) continue;

      await execute(
        `INSERT INTO signal_performance_summary (signal_name, horizon_days, window_start, window_end, hit_rate, avg_top_quintile_return, avg_baseline_return, sample_size, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          signalName, horizon, windowStart, windowEnd,
          results.hitRate, results.avgTopQuintileReturn, results.avgBaselineReturn,
          results.sampleSize, now,
        ]
      );
      computed++;
    }
  }

  return { computed };
}

async function computeHorizonMetrics(
  signalName: string,
  rows: Array<{ trade_date: string; symbol: string; signal_value: number }>,
  tradingDays: string[],
  horizon: number,
): Promise<{
  hitRate: number;
  avgTopQuintileReturn: number;
  avgBaselineReturn: number;
  sampleSize: number;
} | null> {
  const tradingDaySet = new Set(tradingDays);
  const results: Array<{ return: number; signalValue: number }> = [];

  for (const row of rows) {
    const idx = tradingDays.indexOf(row.trade_date);
    if (idx === -1) continue;
    const targetIdx = idx + horizon;
    if (targetIdx >= tradingDays.length) continue; // too recent
    const targetDate = tradingDays[targetIdx];

    // Get close prices for entry and exit
    const entryClose = await getClosePrice(row.symbol, row.trade_date);
    const exitClose = await getClosePrice(row.symbol, targetDate);
    if (entryClose === null || exitClose === null || entryClose === 0) continue;

    const fwdReturn = (exitClose - entryClose) / entryClose;
    results.push({ return: fwdReturn, signalValue: row.signal_value });
  }

  if (results.length < 30) return null;

  // Hit rate: % where signal direction aligns with return direction
  const isPositiveSignal = signalName === "cmf" || signalName === "order_flow_est" || signalName === "momentum_score";
  const hits = results.filter((r) => {
    const signalPositive = isPositiveSignal ? r.signalValue > 0 : r.signalValue > 0.5;
    return (signalPositive && r.return > 0) || (!signalPositive && r.return < 0);
  });
  const hitRate = hits.length / results.length;

  // Top quintile average return
  const sorted = [...results].sort((a, b) => b.signalValue - a.signalValue);
  const top20Count = Math.max(1, Math.ceil(sorted.length * 0.2));
  const topQuintile = sorted.slice(0, top20Count);
  const avgTopQuintileReturn = topQuintile.reduce((s, r) => s + r.return, 0) / top20Count;

  // Baseline average return
  const avgBaselineReturn = results.reduce((s, r) => s + r.return, 0) / results.length;

  return { hitRate, avgTopQuintileReturn, avgBaselineReturn, sampleSize: results.length };
}

async function getClosePrice(symbol: string, tradeDate: string): Promise<number | null> {
  try {
    const row = await one<{ close: number }>(
      "SELECT close FROM stock_daily_ohlcv WHERE symbol = ? AND tradeDate = ?",
      [symbol, tradeDate]
    );
    return row?.close ?? null;
  } catch {
    return null;
  }
}

// ─── Query helpers for API ─────────────────────────────────────────────────

export async function getPerformanceSummary(signalName?: string, horizon?: number) {
  let sql = `SELECT * FROM signal_performance_summary`;
  const where: string[] = [];
  const args: any[] = [];

  if (signalName) {
    where.push("signal_name = ?");
    args.push(signalName);
  }
  if (horizon !== undefined) {
    where.push("horizon_days = ?");
    args.push(horizon);
  }

  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY window_end DESC LIMIT 100";

  const result = await execute(sql, args);
  return result.rows;
}

export async function getPerformanceHistory(signalName: string, horizon = 5) {
  const result = await execute(
    `SELECT * FROM signal_performance_summary
     WHERE signal_name = ? AND horizon_days = ?
     ORDER BY window_end DESC LIMIT 50`,
    [signalName, horizon]
  );
  return result.rows;
}
