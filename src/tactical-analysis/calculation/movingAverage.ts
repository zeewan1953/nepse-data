// Moving averages — Simple (SMA), Exponential (EMA), Triangular (TMA), Displaced (DMA)
// as last-value and as full series (oldest-first input, oldest-first output).

export function smaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push(sum / period);
  }
  return out;
}

export function sma(values: number[], period: number): number | null {
  const s = smaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

/**
 * TMA — Triangular Moving Average (double-smoothed SMA).
 * Less reactive than EMA but very smooth for trend confirmation.
 */
export function tma(values: number[], period: number): number | null {
  const first = smaSeries(values, period);
  if (first.length < period) return null;
  return sma(first, period);
}

/**
 * TMA/DMA Crossover — detects whether DMA has recently crossed above (golden)
 * or below (death) TMA, or is simply in bullish/bearish zone.
 *
 * Requires at least 45 bars (TMA needs 2×20 + DMA shift 5 = 45).
 *
 * Returns:
 *  "golden"  — DMA crossed above TMA in the last 3 bars (Strong Buy)
 *  "death"   — DMA crossed below TMA in the last 3 bars (Strong Sell)
 *  "bullish" — DMA currently above TMA (no recent cross)
 *  "bearish" — DMA currently below TMA (no recent cross)
 *  null      — not enough data
 */
export type TmaDmaCross = "golden" | "death" | "bullish" | "bearish";

export function tmaDmaCrossover(
  values: number[],
  period = 20,
  displacement = 5,
): TmaDmaCross | null {
  // Need TMA series (2×period) + displacement lookback
  const minLen = period * 2 + displacement + 3; // +3 for cross detection window
  if (values.length < minLen) return null;

  // Build TMA series (full history)
  const first = smaSeries(values, period);
  if (first.length < period) return null;
  const tmaSer = smaSeries(first, period);

  // Build DMA series aligned to TMA:
  // DMA[i] = SMA[i - displacement] of original values
  // We compute SMA series then shift
  const smaSer = smaSeries(values, period);
  // Align: tmaSer[i] corresponds to smaSer[i + (smaSer.length - tmaSer.length)]
  // DMA at position i = smaSer at position (i - displacement) in tma-aligned coords
  const offset = smaSer.length - tmaSer.length; // how far ahead smaSer is vs tmaSer

  // For each tma index i, the corresponding DMA = smaSer[i + offset - displacement]
  const len = tmaSer.length;

  function dmaAt(i: number): number | null {
    const idx = i + offset - displacement;
    if (idx < 0 || idx >= smaSer.length) return null;
    return smaSer[idx];
  }

  const curTma = tmaSer[len - 1];
  const curDma = dmaAt(len - 1);
  if (curDma === null || curTma === null) return null;

  // Check last 3 bars for a crossover
  const CROSS_WINDOW = 3;
  for (let i = len - CROSS_WINDOW; i < len - 1; i++) {
    if (i < 1) continue;
    const prevDma = dmaAt(i - 1);
    const prevTma = tmaSer[i - 1];
    const nowDma = dmaAt(i);
    const nowTma = tmaSer[i];
    if (prevDma === null || nowDma === null) continue;
    if (prevDma <= prevTma && nowDma > nowTma) return "golden"; // DMA crossed above TMA
    if (prevDma >= prevTma && nowDma < nowTma) return "death";  // DMA crossed below TMA
  }

  // No cross — return zone
  return curDma > curTma ? "bullish" : "bearish";
}
