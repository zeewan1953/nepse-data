// Bollinger Bands — middle SMA ± (mult × standard deviation).
import { sma } from "./movingAverage";

export type Bands = {
  middle: number;
  upper: number;
  lower: number;
  bandwidth: number;
  percentB: number; // position of price within the bands (0..1)
};

export function bollingerBands(
  closes: number[],
  price: number,
  period = 20,
  mult = 2,
): Bands | null {
  if (closes.length < period) return null;
  const middle = sma(closes, period)!;
  const slice = closes.slice(-period);
  const variance =
    slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const bandwidth = middle ? (upper - lower) / middle : 0;
  const percentB = upper === lower ? 0.5 : (price - lower) / (upper - lower);
  return { middle, upper, lower, bandwidth, percentB };
}
