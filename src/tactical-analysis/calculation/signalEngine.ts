// Signal engine — orchestrates every indicator in this folder into a single
// deep technical verdict: recommendation, confidence, buy/sell zones, stop
// loss, two targets and a factor-by-factor breakdown.
import { sma } from "./movingAverage";
import { rsi } from "./rsi";
import { macd as macdOf, type Macd } from "./macd";
import { bollingerBands } from "./bollingerBands";
import { volumeAnalysis } from "./volumeAnalysis";
import { vwap } from "./vwap";
import { fibonacci, type FibLevels } from "./fibonacci";
import { pivotPoints, type Pivots } from "./pivotPoints";
import { maCrossover } from "./maCrossover";

export type Candle = {
  open?: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Factor = {
  category: string;
  verdict: "Bullish" | "Bearish" | "Neutral";
  note: string;
};

export type Signal = {
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "No Data";
  confidence: number;
  buyZone: [number, number] | null;
  sellZone: [number, number] | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  support: number | null;
  resistance: number | null;
  rsi: number | null;
  macd: Macd | null;
  trend: "Up" | "Down" | "Sideways" | null;
  week52Position: number | null;
  riskReward: number | null;
  vwap: number | null;
  fib: FibLevels | null;
  pivots: Pivots | null;
  factors: Factor[];
  summary: string;
};

function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  return sma(trs, period);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function generateSignal(candles: Candle[], ltp: number): Signal {
  const factors: Factor[] = [];
  const empty: Signal = {
    recommendation: "No Data",
    confidence: 0,
    buyZone: null,
    sellZone: null,
    stopLoss: null,
    target1: null,
    target2: null,
    support: null,
    resistance: null,
    rsi: null,
    macd: null,
    trend: null,
    week52Position: null,
    riskReward: null,
    vwap: null,
    fib: null,
    pivots: null,
    factors: [],
    summary: "Not enough price history to analyse this stock.",
  };
  if (candles.length < 20 || !ltp) return empty;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const lookback = candles.slice(-20);
  const support = Math.min(...lookback.map((c) => c.low));
  const resistance = Math.max(...lookback.map((c) => c.high));
  const range = Math.max(resistance - support, ltp * 0.01);
  const a = atr(candles, 14) ?? range * 0.1;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50) ?? sma20;
  const rsiVal = rsi(closes, 14);
  const macd = macdOf(closes);
  const bb = bollingerBands(closes, ltp, 20, 2);
  const vol = volumeAnalysis(closes, volumes, 20);
  const vw = vwap(candles, 60);
  const cross = maCrossover(closes, 20, 50);

  let score = 50;
  const add = (pts: number, f: Factor) => {
    score += pts;
    factors.push(f);
  };

  // Trend
  let trend: Signal["trend"] = "Sideways";
  if (sma50 && ltp > sma50 * 1.005) {
    trend = "Up";
    add(12, { category: "Trend", verdict: "Bullish", note: "Price above 50-day average — uptrend" });
  } else if (sma50 && ltp < sma50 * 0.995) {
    trend = "Down";
    add(-12, { category: "Trend", verdict: "Bearish", note: "Price below 50-day average — downtrend" });
  } else {
    factors.push({ category: "Trend", verdict: "Neutral", note: "Hovering around 50-day average" });
  }

  // MA crossover
  if (cross) {
    if (cross.cross === "golden") add(12, { category: "MA Crossover", verdict: "Bullish", note: "Golden cross — 20-day crossed above 50-day" });
    else if (cross.cross === "death") add(-12, { category: "MA Crossover", verdict: "Bearish", note: "Death cross — 20-day crossed below 50-day" });
    else if (cross.state === "above") add(6, { category: "MA Crossover", verdict: "Bullish", note: "20-day holding above 50-day" });
    else add(-6, { category: "MA Crossover", verdict: "Bearish", note: "20-day below 50-day" });
  }

  // MACD
  if (macd) {
    if (macd.hist > 0) add(10, { category: "Momentum (MACD)", verdict: "Bullish", note: "MACD above signal — momentum rising" });
    else add(-10, { category: "Momentum (MACD)", verdict: "Bearish", note: "MACD below signal — momentum fading" });
  }

  // RSI
  if (rsiVal !== null) {
    if (rsiVal < 30) add(14, { category: "RSI", verdict: "Bullish", note: `RSI ${rsiVal.toFixed(0)} — oversold` });
    else if (rsiVal > 70) add(-14, { category: "RSI", verdict: "Bearish", note: `RSI ${rsiVal.toFixed(0)} — overbought` });
    else if (rsiVal >= 45 && rsiVal <= 60) add(5, { category: "RSI", verdict: "Bullish", note: `RSI ${rsiVal.toFixed(0)} — healthy` });
    else factors.push({ category: "RSI", verdict: "Neutral", note: `RSI ${rsiVal.toFixed(0)}` });
  }

  // Bollinger
  if (bb) {
    if (bb.percentB <= 0.05) add(8, { category: "Volatility (BB)", verdict: "Bullish", note: "At/under lower band — stretched down" });
    else if (bb.percentB >= 0.95) add(-8, { category: "Volatility (BB)", verdict: "Bearish", note: "At/over upper band — stretched up" });
    else factors.push({ category: "Volatility (BB)", verdict: "Neutral", note: "Inside Bollinger bands" });
  }

  // Volume
  if (vol.spikeRatio !== null) {
    if (vol.spikeRatio > 1.5 && trend === "Up") add(6, { category: "Volume", verdict: "Bullish", note: `Volume ${vol.spikeRatio.toFixed(1)}x avg — buying interest` });
    else if (vol.spikeRatio > 1.5 && trend === "Down") add(-6, { category: "Volume", verdict: "Bearish", note: `Volume ${vol.spikeRatio.toFixed(1)}x avg — selling pressure` });
    else factors.push({ category: "Volume", verdict: "Neutral", note: `Volume ${vol.spikeRatio.toFixed(1)}x avg${vol.obvRising !== null ? `, OBV ${vol.obvRising ? "rising" : "falling"}` : ""}` });
  }

  // VWAP
  if (vw) {
    if (ltp > vw) add(4, { category: "VWAP", verdict: "Bullish", note: `Price above VWAP (${round(vw)})` });
    else add(-4, { category: "VWAP", verdict: "Bearish", note: `Price below VWAP (${round(vw)})` });
  }

  // Position in range
  const pos = (ltp - support) / range;
  if (pos < 0.25) add(8, { category: "Levels", verdict: "Bullish", note: "Near support — good entry zone" });
  else if (pos > 0.8) add(-8, { category: "Levels", verdict: "Bearish", note: "Near resistance — limited upside" });
  else factors.push({ category: "Levels", verdict: "Neutral", note: "Mid-range" });

  // 52-week position
  const longLb = candles.slice(-250);
  const wHigh = Math.max(...longLb.map((c) => c.high));
  const wLow = Math.min(...longLb.map((c) => c.low));
  const week52Position = wHigh > wLow ? ((ltp - wLow) / (wHigh - wLow)) * 100 : null;

  // Fibonacci (swing of recent lookback) & pivots (last candle)
  const fib = fibonacci(resistance, support);
  const lastC = candles[candles.length - 1];
  const pivots = pivotPoints(lastC.high, lastC.low, lastC.close);

  score = Math.max(2, Math.min(98, Math.round(score)));

  // Levels anchored to the CURRENT price (ATR-based R-multiples) so they are
  // always coherent: stopLoss < buyZone < ltp < target1 < target2. Using raw
  // support/resistance breaks down once price runs above resistance (target
  // would sit below the live price). support/resistance are still reported as
  // reference levels below.
  const riskUnit = Math.max(a, ltp * 0.02); // ≥2% or 1 ATR
  const stopLoss = round(ltp - 2 * riskUnit);
  const buyZone: [number, number] = [round(ltp - riskUnit), round(ltp)];
  const target1 = round(ltp + 2 * riskUnit);
  const target2 = round(ltp + 4 * riskUnit);
  const sellZone: [number, number] = [round(target1), round(target2)];
  const riskReward = round((target1 - ltp) / (ltp - stopLoss)); // ≈1.0 (2R/2R)

  let recommendation: Signal["recommendation"];
  if (score >= 75) recommendation = "Strong Buy";
  else if (score >= 60) recommendation = "Buy";
  else if (score >= 45) recommendation = "Hold";
  else if (score >= 30) recommendation = "Sell";
  else recommendation = "Strong Sell";

  const bull = factors.filter((f) => f.verdict === "Bullish").length;
  const bear = factors.filter((f) => f.verdict === "Bearish").length;
  const summary =
    `${recommendation} with ${score}% confidence — ${bull} bullish vs ${bear} bearish factors. ` +
    `Trend ${trend?.toLowerCase()}, RSI ${rsiVal !== null ? rsiVal.toFixed(0) : "n/a"}. ` +
    (riskReward ? `Risk:reward to Target 1 ≈ 1:${riskReward}.` : "");

  return {
    recommendation,
    confidence: score,
    buyZone,
    sellZone,
    stopLoss,
    target1,
    target2,
    support: round(support),
    resistance: round(resistance),
    rsi: rsiVal,
    macd,
    trend,
    week52Position: week52Position !== null ? Math.round(week52Position) : null,
    riskReward,
    vwap: vw !== null ? round(vw) : null,
    fib,
    pivots,
    factors,
    summary,
  };
}
