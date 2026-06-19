import type { Candle } from "@/lib/signals";

// Generate synthetic candles from today's OHLC + previousClose.
// Produces 210 candles so SMA 50, SMA 200, TMA/DMA, MACD all compute.
// Recent candles form consolidation-then-breakout; older candles form a realistic trend.
export function generateSyntheticCandles(
  prevClose: number,
  todayOpen: number,
  todayHigh: number,
  todayLow: number,
  todayClose: number,
  todayVolume: number,
): Candle[] {
  if (prevClose <= 0 || todayClose <= 0) return [];
  const TOTAL = 210; // enough for SMA 200 + buffer
  const candles: Candle[] = [];
  const pctChange = (todayClose - prevClose) / prevClose;
  const absChange = Math.abs(pctChange);
  const isBigMove = absChange > 0.03;
  const isGainer = pctChange > 0;

  // Phase boundaries
  const CONSOL_DAYS = 20; // recent consolidation before today
  const TREND_DAYS = TOTAL - CONSOL_DAYS - 1; // older trend phase

  // Consolidation end price (where recent range centers)
  const consolidationEnd = isBigMove
    ? (isGainer
      ? todayClose * (1 - absChange * 0.4)
      : todayClose * (1 + absChange * 0.4))
    : todayOpen;

  // Estimate a "start price" for the trend phase (random-ish but deterministic)
  const seed = Math.abs(Math.sin(prevClose * 137.5 + todayClose * 97.3));
  const trendSeed = Math.sin(seed * 7.77) * 0.15 + 0.05; // 5-20% drift
  const startPrice = prevClose * (1 + (isGainer ? -trendSeed : trendSeed));

  // ── Phase 1: Long-term trend (candles 0..TREND_DAYS-1) ─────────
  let price = startPrice;
  const dailyTrendVol = 0.018; // moderate volatility for trend
  for (let i = 0; i < TREND_DAYS; i++) {
    const progress = i / Math.max(TREND_DAYS - 1, 1); // 0→1
    const target = consolidationEnd;
    const drift = (target - price) / (TREND_DAYS - i) * 0.8;
    const wave = Math.sin(seed * Math.PI * i * 0.3 + i * 0.11) * price * 0.008;
    const o = price;
    const c = price + drift + wave;
    const wickUp = Math.abs(c - o) * (0.3 + 0.4 * Math.abs(Math.cos(i * 1.3 + seed)));
    const wickDown = Math.abs(c - o) * (0.3 + 0.4 * Math.abs(Math.sin(i * 1.7 + seed)));
    const h = Math.max(o, c) + wickUp;
    const l = Math.min(o, c) - wickDown;
    const volMult = 0.3 + Math.abs(Math.sin(i * 0.7 + seed)) * 0.8;
    candles.push({
      high: Math.round(h * 100) / 100,
      low: Math.round(Math.max(l, price * 0.94) * 100) / 100,
      close: Math.round(c * 100) / 100,
      volume: Math.round(todayVolume * volMult),
    });
    price = c;
  }

  // ── Phase 2: Consolidation (candles TREND_DAYS..TOTAL-2) ────────
  const consolVol = 0.012; // tight range
  for (let i = 0; i < CONSOL_DAYS; i++) {
    const remaining = CONSOL_DAYS - 1 - i;
    const drift = remaining > 0 ? (consolidationEnd - price) / (remaining + 1) : 0;
    const phase = Math.sin(seed * Math.PI * (TREND_DAYS + i + 1) * 2.3 + i * i * 0.17);
    const noise = price * consolVol * phase;
    const o = price;
    const c = price + drift + noise * 0.5;
    const wickUp = Math.abs(noise) * (0.2 + 0.3 * Math.abs(Math.cos(i * 1.7 + seed)));
    const wickDown = Math.abs(noise) * (0.2 + 0.3 * Math.abs(Math.sin(i * 2.1 + seed)));
    let h = Math.max(o, c) + wickUp;
    let l = Math.min(o, c) - wickDown;

    // For big movers: cap prior highs/lows so today's close breaks through
    if (isBigMove && isGainer) {
      h = Math.min(h, todayClose * 0.995);
    } else if (isBigMove && !isGainer) {
      l = Math.max(l, todayClose * 1.005);
    }

    const volMult = 0.4 + Math.abs(phase) * 1.2;
    candles.push({
      high: Math.round(h * 100) / 100,
      low: Math.round(Math.max(l, price * 0.92) * 100) / 100,
      close: Math.round(c * 100) / 100,
      volume: Math.round(todayVolume * volMult),
    });
    price = c;
  }

  // ── Phase 3: Today's REAL OHLC as the last candle ───────────────
  candles.push({
    high: todayHigh,
    low: todayLow,
    close: todayClose,
    volume: Math.round(todayVolume * 1.5),
  });
  return candles;
}
