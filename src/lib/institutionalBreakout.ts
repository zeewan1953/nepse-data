// Institutional Breakout Engine — SMC-based breakout detection with liquidity validation.
// Detects ONLY TRUE BREAKOUTS with compression, liquidity sweep, and multi-factor confirmation.
// Score threshold: ≥90 to generate a valid signal.
import type { Candle } from "@/tactical-analysis/calculation/signalEngine";
import { sma, ema } from "@/tactical-analysis/calculation/movingAverage";
import { rsi } from "@/tactical-analysis/calculation/rsi";
import { macd as macdOf } from "@/tactical-analysis/calculation/macd";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BreakoutDirection = "LONG" | "SHORT" | "NO TRADE";
export type BreakoutType = "Clean Breakout" | "Breakout + Retest" | "Liquidity Breakout";
export type MarketStructure = "Compression" | "Accumulation" | "Distribution" | "Trending" | "Choppy";
export type TradeStatus = "VALID BREAKOUT" | "FAKE BREAKOUT (AVOID)";

export interface InstitutionalBreakout {
  pair: string;
  marketStructure: MarketStructure;
  direction: BreakoutDirection;
  breakoutType: BreakoutType | null;

  // Trade levels
  entryZone: [number, number] | null;
  breakoutLevel: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;

  // Scoring
  riskReward: number | null;
  confidenceScore: number; // 0-100

  // Validation details
  structureCompression: number; // /20
  liquiditySweep: number;       // /20
  volumeExpansion: number;      // /20
  momentumAlignment: number;    // /15
  htfTrendAlignment: number;    // /15
  riskRewardQuality: number;    // /10

  // SMC specifics
  liquidityPools: { type: "equal_highs" | "equal_lows" | "inducement"; price: number }[];
  hasLiquiditySweep: boolean;
  hasFalseBreakoutTrap: boolean;
  wickBreakout: boolean;

  // Reasoning
  validationReason: string;
  tradeStatus: TradeStatus;

  // Simple breakout (legacy) for backwards compat
  simpleSignal: "BUY" | "SELL" | "WAIT";
  simpleEntry: number | null;
  simpleSL: number | null;
  simpleTP1: number | null;
  simpleConfidence: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcAtr(candles: Candle[], period = 14): number {
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

// ─── 1. Market Structure Detection ────────────────────────────────────────────

function detectMarketStructure(candles: Candle[]): { structure: MarketStructure; rangeHigh: number; rangeLow: number; compressionRatio: number } {
  if (candles.length < 10) {
    return { structure: "Choppy", rangeHigh: 0, rangeLow: 0, compressionRatio: 0 };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // EMA trend
  const ema20Val = ema(closes, 20) ?? closes[closes.length - 1];
  const lastClose = closes[closes.length - 1];
  const trendUp = lastClose > ema20Val * 1.01;
  const trendDown = lastClose < ema20Val * 0.99;

  // Look at last 10 candles for range
  const recent = candles.slice(-10);
  const rangeHigh = Math.max(...recent.map((c) => c.high));
  const rangeLow = Math.min(...recent.map((c) => c.low));
  const rangeSize = rangeHigh - rangeLow;
  const avgPrice = (rangeHigh + rangeLow) / 2;
  const compressionRatio = rangeSize / avgPrice; // as % of price

  // Daily body sizes (compression = shrinking bodies)
  const bodies = candles.slice(-10).map((c) => Math.abs(c.close - (c.open ?? c.close)));
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  const firstHalfBody = bodies.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const secondHalfBody = bodies.slice(5).reduce((a, b) => a + b, 0) / 5;

  // Classification
  if (compressionRatio < 0.04 && secondHalfBody < firstHalfBody * 0.8) {
    return { structure: "Compression", rangeHigh, rangeLow, compressionRatio };
  }
  if (compressionRatio < 0.06 && !trendUp && !trendDown) {
    return { structure: "Accumulation", rangeHigh, rangeLow, compressionRatio };
  }
  if (trendUp && compressionRatio < 0.08) {
    return { structure: "Trending", rangeHigh, rangeLow, compressionRatio };
  }
  if (trendDown && compressionRatio < 0.08) {
    return { structure: "Trending", rangeHigh, rangeLow, compressionRatio };
  }
  if (compressionRatio > 0.1) {
    return { structure: "Choppy", rangeHigh, rangeLow, compressionRatio };
  }
  return { structure: "Accumulation", rangeHigh, rangeLow, compressionRatio };
}

// ─── 2. Liquidity Engine ─────────────────────────────────────────────────────

function findLiquidityPools(candles: Candle[], tolerance = 0.008): {
  equalHighs: { price: number; count: number }[];
  equalLows: { price: number; count: number }[];
  allPools: { type: "equal_highs" | "equal_lows" | "inducement"; price: number }[];
} {
  const lookback = candles.slice(-20);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 1; i < lookback.length - 1; i++) {
    if (lookback[i].high > lookback[i - 1].high && lookback[i].high > lookback[i + 1].high) {
      swingHighs.push(lookback[i].high);
    }
    if (lookback[i].low < lookback[i - 1].low && lookback[i].low < lookback[i + 1].low) {
      swingLows.push(lookback[i].low);
    }
  }

  // Cluster equal highs
  const equalHighs: { price: number; count: number }[] = [];
  const usedH = new Set<number>();
  for (let i = 0; i < swingHighs.length; i++) {
    if (usedH.has(i)) continue;
    let count = 1;
    let sum = swingHighs[i];
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (usedH.has(j)) continue;
      if (Math.abs(swingHighs[i] - swingHighs[j]) / swingHighs[i] < tolerance) {
        count++;
        sum += swingHighs[j];
        usedH.add(j);
      }
    }
    if (count >= 2) equalHighs.push({ price: r2(sum / count), count });
    usedH.add(i);
  }

  // Cluster equal lows
  const equalLows: { price: number; count: number }[] = [];
  const usedL = new Set<number>();
  for (let i = 0; i < swingLows.length; i++) {
    if (usedL.has(i)) continue;
    let count = 1;
    let sum = swingLows[i];
    for (let j = i + 1; j < swingLows.length; j++) {
      if (usedL.has(j)) continue;
      if (Math.abs(swingLows[i] - swingLows[j]) / swingLows[i] < tolerance) {
        count++;
        sum += swingLows[j];
        usedL.add(j);
      }
    }
    if (count >= 2) equalLows.push({ price: r2(sum / count), count });
    usedL.add(i);
  }

  const allPools: { type: "equal_highs" | "equal_lows" | "inducement"; price: number }[] = [
    ...equalHighs.map((z) => ({ type: "equal_highs" as const, price: z.price })),
    ...equalLows.map((z) => ({ type: "equal_lows" as const, price: z.price })),
  ];

  return { equalHighs, equalLows, allPools };
}

// ─── 3. Liquidity Sweep Detection ────────────────────────────────────────────

function detectLiquiditySweep(
  candle: Candle,
  equalHighs: { price: number }[],
  equalLows: { price: number }[],
): "sweep_high" | "sweep_low" | null {
  for (const eq of equalHighs) {
    if (candle.high > eq.price && candle.close < eq.price) return "sweep_high";
  }
  for (const eq of equalLows) {
    if (candle.low < eq.price && candle.close > eq.price) return "sweep_low";
  }
  return null;
}

// ─── 4. False Breakout Trap Detection ────────────────────────────────────────

function detectFalseBreakoutTrap(candle: Candle, prevHigh: number, prevLow: number): boolean {
  const body = Math.abs(candle.close - (candle.open ?? candle.close));
  const upperWick = candle.high - Math.max(candle.close, candle.open ?? candle.close);
  const lowerWick = Math.min(candle.close, candle.open ?? candle.close) - candle.low;
  const totalRange = candle.high - candle.low;

  // False breakout above: wick above resistance, body closes back inside
  if (candle.high > prevHigh && candle.close < prevHigh && upperWick > body * 1.5) return true;
  // False breakdown below: wick below support, body closes back inside
  if (candle.low < prevLow && candle.close > prevLow && lowerWick > body * 1.5) return true;

  return false;
}

// ─── 5. Wick Breakout Detection ──────────────────────────────────────────────

function isWickBreakout(candle: Candle, level: number, direction: "up" | "down"): boolean {
  const body = Math.abs(candle.close - (candle.open ?? candle.close));
  const range = candle.high - candle.low;
  if (range === 0) return false;

  if (direction === "up") {
    // Wick breakout: high above level but close BELOW level
    // AND the upper wick is significantly larger than the body
    const upperWick = candle.high - Math.max(candle.close, candle.open ?? candle.close);
    return candle.high > level && candle.close < level && upperWick > body * 0.5;
  } else {
    const lowerWick = Math.min(candle.close, candle.open ?? candle.close) - candle.low;
    return candle.low < level && candle.close > level && lowerWick > body * 0.5;
  }
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function generateInstitutionalBreakout(
  symbol: string,
  candles: Candle[],
  ltp: number,
): InstitutionalBreakout {
  const noTrade: InstitutionalBreakout = {
    pair: symbol,
    marketStructure: "Choppy",
    direction: "NO TRADE",
    breakoutType: null,
    entryZone: null,
    breakoutLevel: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    riskReward: null,
    confidenceScore: 0,
    structureCompression: 0,
    liquiditySweep: 0,
    volumeExpansion: 0,
    momentumAlignment: 0,
    htfTrendAlignment: 0,
    riskRewardQuality: 0,
    liquidityPools: [],
    hasLiquiditySweep: false,
    hasFalseBreakoutTrap: false,
    wickBreakout: false,
    validationReason: "Insufficient data for breakout analysis.",
    tradeStatus: "FAKE BREAKOUT (AVOID)",
    simpleSignal: "WAIT",
    simpleEntry: null,
    simpleSL: null,
    simpleTP1: null,
    simpleConfidence: 0,
  };

  if (candles.length < 22 || !ltp) return noTrade;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const lastCandle = candles[candles.length - 1];
  const atrVal = calcAtr(candles, 14);

  // ─── 1. Market Structure ────────────────────────────────────
  const { structure, rangeHigh, rangeLow, compressionRatio } = detectMarketStructure(candles);

  // ─── 2. Breakout Levels (prior 20 candles) ─────────────────
  const prior = candles.slice(-21, -1); // 20 candles before today
  const prevHigh = Math.max(...prior.map((c) => c.high));
  const prevLow = Math.min(...prior.map((c) => c.low));

  // ─── 3. Liquidity Pools ─────────────────────────────────────
  const { equalHighs, equalLows, allPools } = findLiquidityPools(candles);

  // ─── 4. Sweep & Trap Detection ──────────────────────────────
  const sweep = detectLiquiditySweep(lastCandle, equalHighs, equalLows);
  const hasFalseTrap = detectFalseBreakoutTrap(lastCandle, prevHigh, prevLow);
  const wickAbove = isWickBreakout(lastCandle, prevHigh, "up");
  const wickBelow = isWickBreakout(lastCandle, prevLow, "down");

  // ─── 5. Volume Analysis ─────────────────────────────────────
  const avgVol = sma(volumes.slice(0, -1), 20) ?? volumes[volumes.length - 1];
  const todayVol = volumes[volumes.length - 1];
  const volRatio = avgVol > 0 ? todayVol / avgVol : 1;

  // ─── 6. Momentum ────────────────────────────────────────────
  const rsiVal = rsi(closes, 14);
  const macdVal = macdOf(closes);

  // ─── 7. HTF Trend (daily proxy) ────────────────────────────
  const ema20Val = ema(closes, 20);
  const ema50Val = ema(closes, Math.min(50, closes.length));
  const trendUp = ltp > (ema20Val ?? 0) && ltp > (ema50Val ?? 0);
  const trendDown = ltp < (ema20Val ?? 0) && ltp < (ema50Val ?? 0);

  // ─── 8. Simple Breakout (legacy) ────────────────────────────
  let simpleSignal: "BUY" | "SELL" | "WAIT" = "WAIT";
  let simpleEntry: number | null = null;
  let simpleSL: number | null = null;
  let simpleTP1: number | null = null;
  let simpleConf = 0;

  if (ltp > prevHigh && volRatio >= 1.0) {
    simpleSignal = "BUY";
    simpleEntry = r2(prevHigh);
    simpleSL = r2(prevHigh - atrVal * 1.5);
    simpleTP1 = r2(prevHigh + atrVal * 1.5);
    simpleConf = Math.max(40, Math.min(95, Math.round(55 + (volRatio - 1) * 25)));
  } else if (ltp < prevLow && volRatio >= 1.0) {
    simpleSignal = "SELL";
    simpleEntry = r2(prevLow);
    simpleSL = r2(prevLow + atrVal * 1.5);
    simpleTP1 = r2(prevLow - atrVal * 1.5);
    simpleConf = Math.max(40, Math.min(95, Math.round(55 + (volRatio - 1) * 25)));
  }

  // ─── 9. Confluence Scoring (ALWAYS computed) ────────────────
  let structureCompression = 0; // /20
  let liquiditySweepScore = 0;  // /20
  let volumeExpansion = 0;      // /20
  let momentumAlignment = 0;    // /15
  let htfTrendAlignment = 0;    // /15
  let riskRewardQuality = 0;    // /10

  // Structure compression (20 pts)
  if (structure === "Compression") structureCompression = 20;
  else if (structure === "Accumulation") structureCompression = 15;
  else if (structure === "Distribution") structureCompression = 12;
  else if (structure === "Trending") structureCompression = 8;
  else structureCompression = 0;

  // Liquidity sweep (20 pts)
  if (sweep) liquiditySweepScore = 20;
  else if (equalHighs.length > 0 || equalLows.length > 0) liquiditySweepScore = 10;
  else liquiditySweepScore = 3;

  // Volume expansion (20 pts)
  if (volRatio >= 2.0) volumeExpansion = 20;
  else if (volRatio >= 1.5) volumeExpansion = 15;
  else if (volRatio >= 1.2) volumeExpansion = 10;
  else if (volRatio >= 1.0) volumeExpansion = 5;
  else volumeExpansion = 0;

  // Momentum alignment (15 pts)
  const isBuyBreakout = ltp > prevHigh;
  const isSellBreakout = ltp < prevLow;

  if (isBuyBreakout && rsiVal !== null && rsiVal > 55 && macdVal && macdVal.hist > 0) {
    momentumAlignment = 15;
  } else if (isSellBreakout && rsiVal !== null && rsiVal < 45 && macdVal && macdVal.hist < 0) {
    momentumAlignment = 15;
  } else if (isBuyBreakout && rsiVal !== null && rsiVal > 50) {
    momentumAlignment = 10;
  } else if (isSellBreakout && rsiVal !== null && rsiVal < 50) {
    momentumAlignment = 10;
  } else if (isBuyBreakout || isSellBreakout) {
    momentumAlignment = 5;
  }

  // HTF trend alignment (15 pts)
  if (isBuyBreakout && trendUp) htfTrendAlignment = 15;
  else if (isSellBreakout && trendDown) htfTrendAlignment = 15;
  else if (isBuyBreakout && ema20Val && ltp > ema20Val) htfTrendAlignment = 10;
  else if (isSellBreakout && ema20Val && ltp < ema20Val) htfTrendAlignment = 10;
  else htfTrendAlignment = 3;

  // ─── 10. Calculate Trade Levels ─────────────────────────────
  let direction: BreakoutDirection = "NO TRADE";
  let breakoutType: BreakoutType | null = null;
  let entryZone: [number, number] | null = null;
  let breakoutLevel: number | null = null;
  let stopLoss: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;
  let tp3: number | null = null;

  if (isBuyBreakout) {
    direction = "LONG";
    breakoutLevel = r2(prevHigh);
    if (sweep === "sweep_low") {
      breakoutType = "Liquidity Breakout";
      entryZone = [r2(ltp * 0.997), r2(ltp)];
    } else if (lastCandle.close > prevHigh && (lastCandle.open ?? lastCandle.close) < prevHigh) {
      breakoutType = "Breakout + Retest";
      entryZone = [r2(prevHigh * 0.998), r2(prevHigh * 1.002)];
    } else {
      breakoutType = "Clean Breakout";
      entryZone = [r2(ltp * 0.997), r2(ltp)];
    }
    const eqLow = equalLows.length > 0 ? equalLows[0].price : prevLow;
    stopLoss = r2(Math.max(eqLow * 0.998, prevHigh - atrVal * 2));
    const nextHigh = equalHighs.length > 0
      ? equalHighs.find((e) => e.price > ltp)?.price ?? ltp + atrVal * 3
      : ltp + atrVal * 3;
    tp1 = r2(ltp + (ltp - stopLoss) * 2.5);
    tp2 = r2(ltp + (ltp - stopLoss) * 3.5);
    tp3 = r2(Math.max(nextHigh, ltp + (ltp - stopLoss) * 5));
  } else if (isSellBreakout) {
    direction = "SHORT";
    breakoutLevel = r2(prevLow);
    if (sweep === "sweep_high") {
      breakoutType = "Liquidity Breakout";
      entryZone = [r2(ltp), r2(ltp * 1.003)];
    } else if (lastCandle.close < prevLow && (lastCandle.open ?? lastCandle.close) > prevLow) {
      breakoutType = "Breakout + Retest";
      entryZone = [r2(prevLow * 0.998), r2(prevLow * 1.002)];
    } else {
      breakoutType = "Clean Breakout";
      entryZone = [r2(ltp), r2(ltp * 1.003)];
    }
    const eqHigh = equalHighs.length > 0 ? equalHighs[0].price : prevHigh;
    stopLoss = r2(Math.min(eqHigh * 1.002, prevLow + atrVal * 2));
    tp1 = r2(ltp - (stopLoss - ltp) * 2.5);
    tp2 = r2(ltp - (stopLoss - ltp) * 3.5);
    tp3 = r2(ltp - (stopLoss - ltp) * 5);
  }

  // R:R quality
  const riskAmt = Math.abs(ltp - (stopLoss ?? ltp));
  const reward = Math.abs((tp1 ?? ltp) - ltp);
  const rr = riskAmt > 0 ? reward / riskAmt : 0;
  if (rr >= 3) riskRewardQuality = 10;
  else if (rr >= 2.5) riskRewardQuality = 8;
  else if (rr >= 2) riskRewardQuality = 5;
  else riskRewardQuality = 1;

  // ─── 11. Final Score ────────────────────────────────────────
  const totalScore = structureCompression + liquiditySweepScore + volumeExpansion +
    momentumAlignment + htfTrendAlignment + riskRewardQuality;

  // ─── 12. Trade Validity (hard rules applied AFTER scoring) ──
  let tradeStatus: TradeStatus = "VALID BREAKOUT";
  let validationReason = "";

  // Hard rule: No wick breakouts
  if (wickAbove || wickBelow) {
    tradeStatus = "FAKE BREAKOUT (AVOID)";
    direction = "NO TRADE";
    validationReason = "WICK BREAKOUT — candle poked through level but closed inside. ";
  }
  // Hard rule: No false breakout traps
  else if (hasFalseTrap) {
    tradeStatus = "FAKE BREAKOUT (AVOID)";
    direction = "NO TRADE";
    validationReason = "FALSE BREAKOUT TRAP — liquidity grab, not real breakout. ";
  }
  // Hard rule: No trade in choppy market
  else if (structure === "Choppy") {
    tradeStatus = "FAKE BREAKOUT (AVOID)";
    direction = "NO TRADE";
    validationReason = "Choppy/sideways noise — no clear structure. ";
  }
  // Hard rule: Score must be ≥ 90
  else if (totalScore < 90) {
    tradeStatus = "FAKE BREAKOUT (AVOID)";
    direction = "NO TRADE";
    validationReason = `Score ${totalScore}/100 < 90 threshold. `;
  }
  // Hard rule: Minimum R:R = 1:2.5
  else if (rr < 2.5) {
    tradeStatus = "FAKE BREAKOUT (AVOID)";
    direction = "NO TRADE";
    validationReason = `R:R 1:${rr.toFixed(1)} < 1:2.5 minimum. `;
  }

  // Build reasoning
  const parts: string[] = [];
  parts.push(`Structure: ${structure}${compressionRatio < 0.04 ? " (tight compression)" : ""}.`);
  if (sweep) parts.push(`Liquidity sweep (${sweep === "sweep_high" ? "above highs" : "below lows"}).`);
  if (equalHighs.length > 0) parts.push(`${equalHighs.length} equal high(s) at ${equalHighs.map((e) => e.price).join(", ")}.`);
  if (equalLows.length > 0) parts.push(`${equalLows.length} equal low(s) at ${equalLows.map((e) => e.price).join(", ")}.`);
  parts.push(`Volume: ${volRatio.toFixed(1)}× avg${volRatio >= 1.5 ? " (strong)" : volRatio >= 1.0 ? "" : " (weak)"}.`);
  parts.push(`RSI: ${rsiVal?.toFixed(0) ?? "n/a"}, MACD: ${macdVal ? (macdVal.hist > 0 ? "bullish" : "bearish") : "n/a"}.`);
  parts.push(`HTF: ${trendUp ? "Bullish" : trendDown ? "Bearish" : "Mixed"}.`);
  if (tradeStatus === "FAKE BREAKOUT (AVOID)") {
    parts.push(`Score: ${totalScore}/100.`);
  }
  validationReason += parts.join(" ");

  return {
    pair: symbol,
    marketStructure: structure,
    direction,
    breakoutType,
    entryZone,
    breakoutLevel,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward: r2(rr),
    confidenceScore: totalScore,
    structureCompression,
    liquiditySweep: liquiditySweepScore,
    volumeExpansion,
    momentumAlignment,
    htfTrendAlignment,
    riskRewardQuality,
    liquidityPools: allPools,
    hasLiquiditySweep: !!sweep,
    hasFalseBreakoutTrap: hasFalseTrap,
    wickBreakout: wickAbove || wickBelow,
    validationReason,
    tradeStatus,
    simpleSignal,
    simpleEntry,
    simpleSL,
    simpleTP1,
    simpleConfidence: simpleConf,
  };
}
