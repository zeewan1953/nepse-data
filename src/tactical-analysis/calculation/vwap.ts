// VWAP — Volume Weighted Average Price over the supplied window of candles.
// Uses typical price (H+L+C)/3 weighted by volume.

export type VwapCandle = { high: number; low: number; close: number; volume?: number };

export function vwap(candles: VwapCandle[], window?: number): number | null {
  const data = window ? candles.slice(-window) : candles;
  if (!data.length) return null;
  let pv = 0;
  let vol = 0;
  for (const c of data) {
    const v = c.volume ?? 0;
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * v;
    vol += v;
  }
  if (vol === 0) {
    // no volume info — fall back to mean typical price
    const mean = data.reduce((a, c) => a + (c.high + c.low + c.close) / 3, 0) / data.length;
    return mean;
  }
  return pv / vol;
}
