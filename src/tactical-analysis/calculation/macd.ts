// MACD — Moving Average Convergence Divergence (12/26/9 default).
import { emaSeries } from "./movingAverage";

export type Macd = { macd: number; signal: number; hist: number };

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): Macd | null {
  if (closes.length < slow + signalPeriod) return null;
  const efast = emaSeries(closes, fast);
  const eslow = emaSeries(closes, slow);
  const off = efast.length - eslow.length;
  const line: number[] = [];
  for (let i = 0; i < eslow.length; i++) line.push(efast[i + off] - eslow[i]);
  const sig = emaSeries(line, signalPeriod);
  if (!sig.length) return null;
  const m = line[line.length - 1];
  const s = sig[sig.length - 1];
  return { macd: m, signal: s, hist: m - s };
}
