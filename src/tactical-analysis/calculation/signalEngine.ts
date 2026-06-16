// Signal engine — orchestrates every indicator into a single deep technical
// verdict using weighted scoring per NEPSE_STOCK_ANALYZER_FULL_PROMPT v2.
import { sma, ema, tma, tmaDmaCrossover, smaSeries, type TmaDmaCross } from "./movingAverage";
import { rsi } from "./rsi";
import { macd as macdOf, type Macd } from "./macd";
import { bollingerBands } from "./bollingerBands";
import { volumeAnalysis } from "./volumeAnalysis";
import { vwap } from "./vwap";
import { fibonacci, type FibLevels } from "./fibonacci";
import { pivotPoints, type Pivots } from "./pivotPoints";
import { maCrossover } from "./maCrossover";
import { parabolicSAR, type SAR } from "./parabolicSAR";

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
  weight?: number;
};

export type Signal = {
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "No Data";
  confidence: number;
  buyZone: [number, number] | null;
  sellZone: [number, number] | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  support: number | null;
  resistance: number | null;
  rsi: number | null;
  atr: number | null;
  atrStopLoss: number | null;
  atrTarget1: number | null;
  atrTarget2: number | null;
  atrTarget3: number | null;
  macd: Macd | null;
  trend: "Up" | "Down" | "Sideways" | null;
  week52Position: number | null;
  riskReward: number | null;
  vwap: number | null;
  fib: FibLevels | null;
  pivots: Pivots | null;
  sar: SAR | null;
  tmaValue: number | null;
  /** TMA/DMA crossover state: golden | death | bullish | bearish | null */
  tmaDmaCross: TmaDmaCross | null;
  dmaValue: number | null;
  ema20: number | null;
  sma50: number | null;
  sma200: number | null;
  factors: Factor[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ATR (Wilder's smoothing) */
function calcAtr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  return sma(trs, period);
}

/** OBV — On-Balance Volume trend (rising = bullish) */
function calcOBV(closes: number[], volumes: number[]): boolean | null {
  if (closes.length < 10 || volumes.length < 10) return null;
  let obv = 0;
  const obvSeries: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    obvSeries.push(obv);
  }
  const half = Math.floor(obvSeries.length / 2);
  return obvSeries[obvSeries.length - 1] > obvSeries[half];
}

// ---------------------------------------------------------------------------
// Main signal generator
// ---------------------------------------------------------------------------

export function generateSignal(candles: Candle[], ltp: number): Signal {
  const empty: Signal = {
    recommendation: "No Data",
    confidence: 0,
    buyZone: null, sellZone: null,
    stopLoss: null, target1: null, target2: null, target3: null,
    support: null, resistance: null,
    rsi: null, atr: null,
    atrStopLoss: null, atrTarget1: null, atrTarget2: null, atrTarget3: null,
    macd: null, trend: null,
    week52Position: null, riskReward: null, vwap: null,
    fib: null, pivots: null, sar: null,
    tmaValue: null, tmaDmaCross: null, dmaValue: null,
    ema20: null, sma50: null, sma200: null,
    factors: [],
    summary: "Not enough price history to analyse this stock.",
  };
  if (candles.length < 20 || !ltp) return empty;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);

  // Support / resistance from last 20 candles
  const lookback = candles.slice(-20);
  const support = Math.min(...lookback.map((c) => c.low));
  const resistance = Math.max(...lookback.map((c) => c.high));
  const range = Math.max(resistance - support, ltp * 0.01);

  // ---------------------------------------------------------------------------
  // Calculate all indicators
  // ---------------------------------------------------------------------------
  const atrVal = calcAtr(candles, 14);
  const rsiVal = rsi(closes, 14);
  const macdVal = macdOf(closes);
  const bb = bollingerBands(closes, ltp, 20, 2);
  const vol = volumeAnalysis(closes, volumes, 20);
  const vw = vwap(candles, 60);
  const cross = maCrossover(closes, 20, 50);
  const sarVal = parabolicSAR(candles);
  const obvRising = calcOBV(closes, volumes);

  const sma20Val = sma(closes, 20);
  const sma50Val = candles.length >= 50 ? sma(closes, 50) : null;
  const sma200Val = candles.length >= 200 ? sma(closes, 200) : null;
  const ema20Val = ema(closes, 20);
  const tmaVal = tma(closes, 20);
  // TMA/DMA combined crossover (requires 45+ bars)
  const tmaDmaCross = tmaDmaCrossover(closes, 20, 5);

  // ATR-based price levels (dynamic, always coherent)
  const a = atrVal ?? range * 0.1;
  const riskUnit = Math.max(a, ltp * 0.02); // ≥2% or 1 ATR

  // ATR Stop Loss (price - 1.5 × ATR) per prompt spec
  const atrSL = atrVal !== null ? round2(ltp - atrVal * 1.5) : null;
  const riskForATR = atrSL !== null ? ltp - atrSL : riskUnit;
  const atrT1 = atrSL !== null ? round2(ltp + riskForATR * 1) : null;
  const atrT2 = atrSL !== null ? round2(ltp + riskForATR * 2) : null;
  const atrT3 = atrSL !== null ? round2(ltp + riskForATR * 3) : null;

  // ---------------------------------------------------------------------------
  // Weighted scoring system (per prompt weights)
  // ---------------------------------------------------------------------------
  // Weights: sma50=2, ema20=2, tma=1.5, dma=1.5, SAR=2, RSI=2, MACD=2, RS=1.5
  //          BB=1, ATR=1, Volume=1, OBV=1.5, VWAP=1, Fib=1
  const factors: Factor[] = [];

  let bullScore = 0;
  let bearScore = 0;
  let totalWeight = 0;

  function vote(
    verdict: "Bullish" | "Bearish" | "Neutral",
    weight: number,
    category: string,
    note: string,
  ) {
    totalWeight += weight;
    if (verdict === "Bullish") bullScore += weight;
    else if (verdict === "Bearish") bearScore += weight;
    factors.push({ category, verdict, note, weight });
  }

  // 1. SMA 200 trend (weight 2) — only when enough data
  if (sma200Val !== null) {
    if (ltp > sma200Val * 1.005)
      vote("Bullish", 2, "SMA 200", `Price above 200-day SMA (${round2(sma200Val)}) — long-term uptrend`);
    else if (ltp < sma200Val * 0.995)
      vote("Bearish", 2, "SMA 200", `Price below 200-day SMA (${round2(sma200Val)}) — long-term downtrend`);
    else
      vote("Neutral", 2, "SMA 200", `Price near 200-day SMA (${round2(sma200Val)})`);
  }

  // 2. SMA 50 trend (weight 2)
  if (sma50Val !== null) {
    if (ltp > sma50Val * 1.005)
      vote("Bullish", 2, "SMA 50", `Price above 50-day SMA (${round2(sma50Val)}) — medium uptrend`);
    else if (ltp < sma50Val * 0.995)
      vote("Bearish", 2, "SMA 50", `Price below 50-day SMA (${round2(sma50Val)}) — medium downtrend`);
    else
      vote("Neutral", 2, "SMA 50", `Price near 50-day SMA (${round2(sma50Val)})`);
  }

  // 3. EMA 20 (weight 2)
  if (ema20Val !== null) {
    if (ltp > ema20Val)
      vote("Bullish", 2, "EMA 20", `Price above EMA-20 (${round2(ema20Val)}) — short uptrend`);
    else
      vote("Bearish", 2, "EMA 20", `Price below EMA-20 (${round2(ema20Val)}) — short downtrend`);
  }

  // 4 & 5. TMA/DMA Combined Crossover (weight 3.0 — highest priority MA signal)
  // Golden Cross: DMA crosses above TMA → Strong Buy
  // Death Cross:  DMA crosses below TMA → Strong Sell
  // Bullish/Bearish zone: no recent cross, weight 1.5
  if (tmaDmaCross !== null) {
    if (tmaDmaCross === "golden")
      vote("Bullish", 3.0, "TMA/DMA Cross", "⭐ Golden Cross — DMA crossed above TMA (strongest buy signal)");
    else if (tmaDmaCross === "death")
      vote("Bearish", 3.0, "TMA/DMA Cross", "💀 Death Cross — DMA crossed below TMA (strongest sell signal)");
    else if (tmaDmaCross === "bullish")
      vote("Bullish", 1.5, "TMA/DMA Cross", "DMA above TMA — bullish momentum zone (no cross yet)");
    else
      vote("Bearish", 1.5, "TMA/DMA Cross", "DMA below TMA — bearish momentum zone (no cross yet)");
  }

  // 6. Parabolic SAR (weight 2)
  if (sarVal !== null) {
    if (sarVal.bullish)
      vote("Bullish", 2, "Parabolic SAR", `SAR ${round2(sarVal.sar)} below price — uptrend, trailing stop`);
    else
      vote("Bearish", 2, "Parabolic SAR", `SAR ${round2(sarVal.sar)} above price — downtrend, exit signal`);
  }

  // 7. MA Golden/Death Cross (weight 1.5)
  if (cross) {
    if (cross.cross === "golden")
      vote("Bullish", 1.5, "MA Crossover", "Golden cross — 20-day crossed above 50-day");
    else if (cross.cross === "death")
      vote("Bearish", 1.5, "MA Crossover", "Death cross — 20-day crossed below 50-day");
    else if (cross.state === "above")
      vote("Bullish", 1, "MA Crossover", "20-day holding above 50-day");
    else
      vote("Bearish", 1, "MA Crossover", "20-day below 50-day");
  }

  // 8. RSI (weight 2)
  if (rsiVal !== null) {
    if (rsiVal < 30)
      vote("Bullish", 2, "RSI", `RSI ${rsiVal.toFixed(0)} — Oversold, bounce likely`);
    else if (rsiVal > 70)
      vote("Bearish", 2, "RSI", `RSI ${rsiVal.toFixed(0)} — Overbought, pullback risk`);
    else if (rsiVal >= 55 && rsiVal <= 70)
      vote("Bullish", 2, "RSI", `RSI ${rsiVal.toFixed(0)} — Bullish momentum zone`);
    else if (rsiVal <= 45 && rsiVal > 30)
      vote("Bearish", 2, "RSI", `RSI ${rsiVal.toFixed(0)} — Bearish momentum zone`);
    else
      vote("Neutral", 2, "RSI", `RSI ${rsiVal.toFixed(0)} — Neutral zone (45–55)`);
  }

  // 9. MACD (weight 2)
  if (macdVal) {
    if (macdVal.hist > 0)
      vote("Bullish", 2, "MACD", `MACD histogram +${round2(macdVal.hist)} — momentum rising`);
    else
      vote("Bearish", 2, "MACD", `MACD histogram ${round2(macdVal.hist)} — momentum fading`);
  }

  // 10. Bollinger Bands (weight 1)
  if (bb) {
    if (bb.percentB <= 0.05)
      vote("Bullish", 1, "Bollinger Bands", `At/under lower band — oversold stretch (B%=${bb.percentB.toFixed(2)})`);
    else if (bb.percentB >= 0.95)
      vote("Bearish", 1, "Bollinger Bands", `At/over upper band — overbought stretch (B%=${bb.percentB.toFixed(2)})`);
    else
      vote("Neutral", 1, "Bollinger Bands", `Inside bands, bandwidth ${(bb.bandwidth * 100).toFixed(1)}%`);
  }

  // 11. Volume (weight 1)
  const trend: Signal["trend"] = (() => {
    const ref = sma50Val ?? sma20Val;
    if (ref && ltp > ref * 1.005) return "Up";
    if (ref && ltp < ref * 0.995) return "Down";
    return "Sideways";
  })();

  if (vol.spikeRatio !== null) {
    if (vol.spikeRatio > 1.5 && trend === "Up")
      vote("Bullish", 1, "Volume", `${vol.spikeRatio.toFixed(1)}× avg volume on uptrend — buying pressure`);
    else if (vol.spikeRatio > 1.5 && trend === "Down")
      vote("Bearish", 1, "Volume", `${vol.spikeRatio.toFixed(1)}× avg volume on downtrend — selling pressure`);
    else
      vote("Neutral", 1, "Volume", `Volume ${vol.spikeRatio.toFixed(1)}× avg`);
  }

  // 12. OBV (weight 1.5)
  if (obvRising !== null) {
    if (obvRising)
      vote("Bullish", 1.5, "OBV", "On-Balance Volume rising — accumulation");
    else
      vote("Bearish", 1.5, "OBV", "On-Balance Volume falling — distribution");
  }

  // 13. VWAP (weight 1)
  if (vw !== null) {
    if (ltp > vw)
      vote("Bullish", 1, "VWAP", `Price above VWAP (${round2(vw)}) — bullish intraday`);
    else
      vote("Bearish", 1, "VWAP", `Price below VWAP (${round2(vw)}) — bearish intraday`);
  }

  // 14. Fibonacci / price levels (weight 1)
  const pos = (ltp - support) / range;
  if (pos < 0.25)
    vote("Bullish", 1, "Fibonacci/Levels", "Near support zone — potential reversal entry");
  else if (pos > 0.8)
    vote("Bearish", 1, "Fibonacci/Levels", "Near resistance zone — limited upside short-term");
  else
    vote("Neutral", 1, "Fibonacci/Levels", "Mid-range between support and resistance");

  // ---------------------------------------------------------------------------
  // Compute final confidence and recommendation
  // ---------------------------------------------------------------------------
  const confidence = totalWeight > 0
    ? Math.max(2, Math.min(98, Math.round((bullScore / totalWeight) * 100)))
    : 50;

  let recommendation: Signal["recommendation"];
  if (confidence >= 75) recommendation = "Strong Buy";
  else if (confidence >= 58) recommendation = "Buy";
  else if (confidence >= 42) recommendation = "Hold";
  else if (confidence >= 25) recommendation = "Sell";
  else recommendation = "Strong Sell";

  // Price levels (ATR-based, coherent)
  const stopLoss = round2(ltp - 2 * riskUnit);
  const buyZone: [number, number] = [round2(ltp - riskUnit), round2(ltp)];
  const target1 = round2(ltp + 2 * riskUnit);
  const target2 = round2(ltp + 4 * riskUnit);
  const target3 = round2(ltp + 6 * riskUnit);
  const sellZone: [number, number] = [round2(target1), round2(target2)];
  const riskReward = round2((target1 - ltp) / Math.max(ltp - stopLoss, 0.01));

  // 52W position
  const longLb = candles.slice(-250);
  const wHigh = Math.max(...longLb.map((c) => c.high));
  const wLow = Math.min(...longLb.map((c) => c.low));
  const week52Position = wHigh > wLow ? Math.round(((ltp - wLow) / (wHigh - wLow)) * 100) : null;

  const fib = fibonacci(resistance, support);
  const lastC = candles[candles.length - 1];
  const pivots = pivotPoints(lastC.high, lastC.low, lastC.close);

  const bull = factors.filter((f) => f.verdict === "Bullish").length;
  const bear = factors.filter((f) => f.verdict === "Bearish").length;
  const summary =
    `${recommendation} — confidence ${confidence}% (${bull} bullish vs ${bear} bearish factors). ` +
    `Trend ${trend?.toLowerCase()}, RSI ${rsiVal !== null ? rsiVal.toFixed(0) : "n/a"}` +
    (sarVal ? `, SAR ${sarVal.bullish ? "▼ Bullish" : "▲ Bearish"}` : "") +
    (atrVal !== null ? `, ATR ${round2(atrVal)}` : "") +
    (riskReward ? `. Risk:Reward ≈ 1:${riskReward}.` : ".");

  return {
    recommendation,
    confidence,
    buyZone,
    sellZone,
    stopLoss,
    target1,
    target2,
    target3,
    support: round2(support),
    resistance: round2(resistance),
    rsi: rsiVal,
    atr: atrVal !== null ? round2(atrVal) : null,
    atrStopLoss: atrSL,
    atrTarget1: atrT1,
    atrTarget2: atrT2,
    atrTarget3: atrT3,
    macd: macdVal,
    trend,
    week52Position,
    riskReward,
    vwap: vw !== null ? round2(vw) : null,
    fib,
    pivots,
    sar: sarVal,
    tmaValue: tmaVal !== null ? round2(tmaVal) : null,
    tmaDmaCross,
    dmaValue: null,
    ema20: ema20Val !== null ? round2(ema20Val) : null,
    sma50: sma50Val !== null ? round2(sma50Val) : null,
    sma200: sma200Val !== null ? round2(sma200Val) : null,
    factors,
    summary,
  };
}
