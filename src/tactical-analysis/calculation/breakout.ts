// Daily breakout strategy:
//   BUY  if price breaks above the prior N-day high with above-average volume
//   SELL if price breaks below the prior N-day low with above-average volume
//   WAIT otherwise (weak / no breakout)
// Targets are R-multiples of the ATR-based risk.
import type { Candle } from "./signalEngine";
import { sma } from "./movingAverage";

export type Breakout = {
  signal: "BUY" | "SELL" | "WAIT";
  buyZone: [number, number] | null;
  sellZone: [number, number] | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  confidence: number;
};

function atr(candles: Candle[], period = 14): number {
  if (candles.length <= period) {
    const hi = Math.max(...candles.map((c) => c.high));
    const lo = Math.min(...candles.map((c) => c.low));
    return (hi - lo) / Math.max(candles.length, 1) || 1;
  }
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  return sma(trs, period) ?? trs[trs.length - 1];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function breakout(candles: Candle[], price: number, lookback = 20): Breakout {
  const wait: Breakout = {
    signal: "WAIT",
    buyZone: null,
    sellZone: null,
    entry: null,
    sl: null,
    tp1: null,
    tp2: null,
    tp3: null,
    confidence: 0,
  };
  if (candles.length < lookback + 2 || !price) return wait;

  const prior = candles.slice(0, -1); // exclude the current/last candle
  const window = prior.slice(-lookback);
  const prevHigh = Math.max(...window.map((c) => c.high));
  const prevLow = Math.min(...window.map((c) => c.low));

  const vols = candles.map((c) => c.volume ?? 0);
  const avgVol = sma(vols.slice(0, -1), lookback) ?? 0;
  const todayVol = vols[vols.length - 1] ?? 0;
  const volRatio = avgVol > 0 ? todayVol / avgVol : 1;
  const volOk = avgVol > 0 ? todayVol >= avgVol : true; // require average+ volume

  const a = atr(candles, 14);
  const buyZone: [number, number] = [r2(prevHigh), r2(prevHigh + 0.5 * a)];
  const sellZone: [number, number] = [r2(prevLow - 0.5 * a), r2(prevLow)];

  // BUY breakout
  if (price > prevHigh && volOk) {
    const entry = prevHigh;
    const risk = 1.5 * a;
    const sl = entry - risk;
    const mag = (price - prevHigh) / prevHigh; // breakout strength
    const confidence = Math.max(40, Math.min(95, Math.round(55 + (volRatio - 1) * 25 + mag * 500)));
    return {
      signal: "BUY",
      buyZone,
      sellZone,
      entry: r2(entry),
      sl: r2(sl),
      tp1: r2(entry + risk),
      tp2: r2(entry + 2 * risk),
      tp3: r2(entry + 3 * risk),
      confidence,
    };
  }

  // SELL breakdown
  if (price < prevLow && volOk) {
    const entry = prevLow;
    const risk = 1.5 * a;
    const sl = entry + risk;
    const mag = (prevLow - price) / prevLow;
    const confidence = Math.max(40, Math.min(95, Math.round(55 + (volRatio - 1) * 25 + mag * 500)));
    return {
      signal: "SELL",
      buyZone,
      sellZone,
      entry: r2(entry),
      sl: r2(sl),
      tp1: r2(entry - risk),
      tp2: r2(entry - 2 * risk),
      tp3: r2(entry - 3 * risk),
      confidence,
    };
  }

  // WAIT — show the levels to watch and how close price is to a breakout.
  const range = prevHigh - prevLow || price * 0.01;
  const distToHigh = (prevHigh - price) / range;
  const proximity = Math.max(0, Math.min(40, Math.round((1 - Math.abs(distToHigh)) * 40)));
  return { ...wait, buyZone, sellZone, confidence: proximity };
}
