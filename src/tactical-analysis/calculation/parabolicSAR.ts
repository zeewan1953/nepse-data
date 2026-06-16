// Parabolic SAR — Wilder's Stop-and-Reverse indicator.
// Uptrend  → SAR dots appear BELOW price (bullish)
// Downtrend → SAR dots appear ABOVE price (bearish)

import type { Candle } from "./signalEngine";

export type SAR = {
  sar: number;
  trend: "up" | "down";
  /** true when SAR is below price (bullish position) */
  bullish: boolean;
};

export function parabolicSAR(
  candles: Candle[],
  initialAF = 0.02,
  maxAF = 0.2,
): SAR | null {
  if (candles.length < 5) return null;

  let isUptrend = candles[1].close > candles[0].close;
  let af = initialAF;
  let ep = isUptrend
    ? Math.max(candles[0].high, candles[1].high)
    : Math.min(candles[0].low, candles[1].low);
  let sar = isUptrend
    ? Math.min(candles[0].low, candles[1].low)
    : Math.max(candles[0].high, candles[1].high);

  for (let i = 2; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevLow1 = candles[i - 1].low;
    const prevLow2 = i >= 2 ? candles[i - 2].low : prevLow1;
    const prevHigh1 = candles[i - 1].high;
    const prevHigh2 = i >= 2 ? candles[i - 2].high : prevHigh1;

    // Advance SAR
    sar = sar + af * (ep - sar);

    if (isUptrend) {
      // SAR must stay below last two lows
      sar = Math.min(sar, prevLow1, prevLow2);
      if (low < sar) {
        // Reversal → switch to downtrend
        isUptrend = false;
        sar = ep;
        ep = low;
        af = initialAF;
      } else {
        if (high > ep) {
          ep = high;
          af = Math.min(af + initialAF, maxAF);
        }
      }
    } else {
      // SAR must stay above last two highs
      sar = Math.max(sar, prevHigh1, prevHigh2);
      if (high > sar) {
        // Reversal → switch to uptrend
        isUptrend = true;
        sar = ep;
        ep = high;
        af = initialAF;
      } else {
        if (low < ep) {
          ep = low;
          af = Math.min(af + initialAF, maxAF);
        }
      }
    }
  }

  const lastClose = candles[candles.length - 1].close;
  return {
    sar: Math.round(sar * 100) / 100,
    trend: isUptrend ? "up" : "down",
    bullish: isUptrend && sar < lastClose,
  };
}
