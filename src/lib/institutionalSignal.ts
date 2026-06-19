// Institutional SMC (Smart Money Concepts) Signal Engine
// Produces ONLY high-probability, data-driven trades with strict risk control.
// Requires minimum 20 candles of daily OHLCV data.
import type { Candle } from "@/tactical-analysis/calculation/signalEngine";
import { sma, ema } from "@/tactical-analysis/calculation/movingAverage";
import { rsi } from "@/tactical-analysis/calculation/rsi";
import { macd as macdOf } from "@/tactical-analysis/calculation/macd";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketRegime =
  | "Trending Bullish"
  | "Trending Bearish"
  | "Ranging"
  | "High Volatility";

export type EntryType =
  | "Breakout"
  | "Retest"
  | "Liquidity Sweep Entry"
  | "Break of Structure"
  | "Change of Character";

export type Direction = "LONG" | "SHORT" | "NO TRADE";

export interface InstitutionalSignal {
  // Core output
  pair: string;
  marketRegime: MarketRegime;
  htfTrend: string; // "Bullish" | "Bearish" | "Neutral"
  direction: Direction;
  entryType: EntryType | null;

  // Trade levels
  entryZone: [number, number] | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;

  // Scoring
  riskReward: number | null;
  confidenceScore: number; // 0-100

  // SMC specifics
  liquidityZones: { type: "equal_highs" | "equal_lows" | "order_block"; price: number }[];
  structureEvent: "BOS" | "CHoCH" | "Liquidity Sweep" | null;
  orderBlocks: { type: "demand" | "supply"; high: number; low: number }[];

  // Breakdown scores
  scores: {
    trendAlignment: number;    // /25
    structureQuality: number;  // /20
    liquidityEvent: number;    // /20
    momentum: number;          // /15
    volumeStrength: number;    // /10
    riskRewardQuality: number; // /10
  };

  // Reasoning
  reasoning: string;
  tradeValid: "Valid" | "Invalid";
  invalidReason: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Detect swing highs/lows (local extremes) */
function findSwings(candles: Candle[], lookback = 3) {
  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows: { idx: number; price: number }[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) swingHighs.push({ idx: i, price: candles[i].high });
    if (isLow) swingLows.push({ idx: i, price: candles[i].low });
  }
  return { swingHighs, swingLows };
}

/** Detect equal highs/lows (liquidity pools) */
function findLiquidityZones(
  swings: { price: number }[],
  tolerance = 0.008, // 0.8% tolerance for "equal"
): { price: number; count: number }[] {
  const zones: { price: number; count: number }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < swings.length; i++) {
    if (used.has(i)) continue;
    let count = 1;
    for (let j = i + 1; j < swings.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(swings[i].price - swings[j].price) / swings[i].price < tolerance) {
        count++;
        used.add(j);
      }
    }
    if (count >= 2) zones.push({ price: r2(swings[i].price), count });
    used.add(i);
  }
  return zones;
}

/** Detect order blocks (last opposite candle before strong move) */
function findOrderBlocks(candles: Candle[]): { type: "demand" | "supply"; high: number; low: number }[] {
  const blocks: { type: "demand" | "supply"; high: number; low: number }[] = [];
  if (candles.length < 5) return blocks;

  for (let i = 2; i < candles.length - 1; i++) {
    const curr = candles[i];
    const next = candles[i + 1];
    const body = Math.abs(curr.close - (curr.open ?? curr.close));
    const range = curr.high - curr.low;
    if (range === 0) continue;

    // Demand block: bearish candle followed by strong bullish candle that closes above the bearish high
    if (curr.close < (curr.open ?? curr.close) && next.close > curr.high && next.close > next.open!) {
      blocks.push({ type: "demand", high: r2(curr.high), low: r2(curr.low) });
    }
    // Supply block: bullish candle followed by strong bearish candle that closes below the bullish low
    else if (curr.close > (curr.open ?? curr.close) && next.close < curr.low && next.close < next.open!) {
      blocks.push({ type: "supply", high: r2(curr.high), low: r2(curr.low) });
    }
  }
  return blocks.slice(-4); // keep last 4
}

/** Detect Break of Structure (BOS) and Change of Character (CHoCH) */
function detectStructure(
  swingHighs: { idx: number; price: number }[],
  swingLows: { idx: number; price: number }[],
  lastClose: number,
): { event: "BOS" | "CHoCH" | null; direction: "bullish" | "bearish" } {
  // Check for bullish BOS: price breaks above last swing high
  if (swingHighs.length >= 2) {
    const lastSH = swingHighs[swingHighs.length - 1];
    const prevSH = swingHighs[swingHighs.length - 2];
    if (lastClose > lastSH.price && lastSH.price > prevSH.price) {
      return { event: "BOS", direction: "bullish" };
    }
    if (lastClose > lastSH.price && lastSH.price < prevSH.price) {
      return { event: "CHoCH", direction: "bullish" };
    }
  }
  // Check for bearish BOS: price breaks below last swing low
  if (swingLows.length >= 2) {
    const lastSL = swingLows[swingLows.length - 1];
    const prevSL = swingLows[swingLows.length - 2];
    if (lastClose < lastSL.price && lastSL.price < prevSL.price) {
      return { event: "BOS", direction: "bearish" };
    }
    if (lastClose < lastSL.price && lastSL.price > prevSL.price) {
      return { event: "CHoCH", direction: "bearish" };
    }
  }
  return { event: null, direction: "bullish" };
}

/** Detect liquidity sweep (price wicks beyond equal highs/lows but closes back inside) */
function detectLiquiditySweep(
  candle: Candle,
  eqHighs: { price: number }[],
  eqLows: { price: number }[],
): "sweep_high" | "sweep_low" | null {
  // Sweep of equal highs: price goes above but closes below
  for (const eq of eqHighs) {
    if (candle.high > eq.price && candle.close < eq.price) {
      return "sweep_high";
    }
  }
  // Sweep of equal lows: price goes below but closes above
  for (const eq of eqLows) {
    if (candle.low < eq.price && candle.close > eq.price) {
      return "sweep_low";
    }
  }
  return null;
}

// ─── Market Regime Detection ──────────────────────────────────────────────────

function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < 20) return "Ranging";

  const closes = candles.map((c) => c.close);
  const ema20Val = ema(closes, 20) ?? closes[closes.length - 1];
  const sma50Val = sma(closes, Math.min(50, closes.length)) ?? closes[closes.length - 1];

  // EMA slope (last 5 bars)
  const recentEma: number[] = [];
  for (let i = Math.max(0, closes.length - 5); i < closes.length; i++) {
    recentEma.push(ema(closes.slice(0, i + 1), 20) ?? closes[i]);
  }
  const emaSlope = recentEma.length >= 2 ? recentEma[recentEma.length - 1] - recentEma[0] : 0;
  const emaSlopePct = emaSlope / (recentEma[0] || 1);

  // Volatility: ATR / price ratio
  const lastCandle = candles[candles.length - 1];
  const atrAvg = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const volRatio = atrAvg / lastCandle.close;

  // High volatility: ATR > 5% of price
  if (volRatio > 0.05) return "High Volatility";

  // Trending: strong EMA slope + price above/below SMA50
  if (emaSlopePct > 0.003 && lastCandle.close > sma50Val) return "Trending Bullish";
  if (emaSlopePct < -0.003 && lastCandle.close < sma50Val) return "Trending Bearish";

  return "Ranging";
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function generateInstitutionalSignal(
  symbol: string,
  candles: Candle[],
  ltp: number,
): InstitutionalSignal {
  const noTrade: InstitutionalSignal = {
    pair: symbol,
    marketRegime: "Ranging",
    htfTrend: "Neutral",
    direction: "NO TRADE",
    entryType: null,
    entryZone: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    riskReward: null,
    confidenceScore: 0,
    liquidityZones: [],
    structureEvent: null,
    orderBlocks: [],
    scores: { trendAlignment: 0, structureQuality: 0, liquidityEvent: 0, momentum: 0, volumeStrength: 0, riskRewardQuality: 0 },
    reasoning: "Insufficient data for institutional analysis.",
    tradeValid: "Invalid",
    invalidReason: "Not enough candle data.",
  };

  if (candles.length < 20 || !ltp) return noTrade;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const lastCandle = candles[candles.length - 1];

  // ─── 1. Market Regime ─────────────────────────────────────────
  const regime = detectMarketRegime(candles);

  // HARD RULE: No trade in Ranging or High Volatility
  if (regime === "Ranging" || regime === "High Volatility") {
    return {
      ...noTrade,
      marketRegime: regime,
      reasoning: `Market regime is ${regime}. Institutional rules: NO TRADE.`,
      tradeValid: "Invalid",
      invalidReason: `${regime} — No Trade Zone`,
    };
  }

  // ─── 2. Multi-Timeframe Trend (Daily proxy) ──────────────────
  const ema20Val = ema(closes, 20);
  const sma50Val = sma(closes, Math.min(50, closes.length));
  const rsiVal = rsi(closes, 14);
  const macdVal = macdOf(closes);

  const isBullishTrend = regime === "Trending Bullish";
  const htfTrend = isBullishTrend ? "Bullish" : "Bearish";

  // ─── 3. Structure Analysis (BOS/CHoCH) ────────────────────────
  const swings = findSwings(candles, 2);
  const structure = detectStructure(swings.swingHighs, swings.swingLows, ltp);

  // ─── 4. Liquidity Zones ───────────────────────────────────────
  const eqHighZones = findLiquidityZones(swings.swingHighs);
  const eqLowZones = findLiquidityZones(swings.swingLows);
  const orderBlocks = findOrderBlocks(candles);

  const liquidityZones: InstitutionalSignal["liquidityZones"] = [
    ...eqHighZones.map((z) => ({ type: "equal_highs" as const, price: z.price })),
    ...eqLowZones.map((z) => ({ type: "equal_lows" as const, price: z.price })),
    ...orderBlocks.map((ob) => ({
      type: "order_block" as const,
      price: ob.type === "demand" ? ob.low : ob.high,
    })),
  ];

  // ─── 5. Liquidity Sweep Detection ────────────────────────────
  const sweep = detectLiquiditySweep(lastCandle, eqHighZones, eqLowZones);

  // ─── 6. Confluence Scoring ────────────────────────────────────
  let trendAlignment = 0;     // /25
  let structureQuality = 0;   // /20
  let liquidityEvent = 0;     // /20
  let momentum = 0;           // /15
  let volumeStrength = 0;     // /10
  let riskRewardQuality = 0;  // /10

  // Trend alignment (25 pts)
  if (ema20Val && sma50Val) {
    if (isBullishTrend && ltp > ema20Val && ltp > sma50Val) trendAlignment = 25;
    else if (!isBullishTrend && ltp < ema20Val && ltp < sma50Val) trendAlignment = 25;
    else if (isBullishTrend && ltp > ema20Val) trendAlignment = 15;
    else if (!isBullishTrend && ltp < ema20Val) trendAlignment = 15;
    else trendAlignment = 5;
  }

  // Structure quality (20 pts)
  if (structure.event === "BOS") {
    if ((isBullishTrend && structure.direction === "bullish") ||
        (!isBullishTrend && structure.direction === "bearish")) {
      structureQuality = 20;
    } else {
      structureQuality = 8;
    }
  } else if (structure.event === "CHoCH") {
    structureQuality = 15;
  } else {
    structureQuality = 5;
  }

  // Liquidity event (20 pts)
  if (sweep === "sweep_high" && !isBullishTrend) liquidityEvent = 20;
  else if (sweep === "sweep_low" && isBullishTrend) liquidityEvent = 20;
  else if (sweep) liquidityEvent = 12;
  else if (liquidityZones.length > 0) liquidityEvent = 8;
  else liquidityEvent = 3;

  // Momentum (15 pts)
  if (rsiVal !== null && macdVal) {
    if (isBullishTrend && rsiVal > 55 && macdVal.hist > 0) momentum = 15;
    else if (!isBullishTrend && rsiVal < 45 && macdVal.hist < 0) momentum = 15;
    else if (isBullishTrend && rsiVal > 50) momentum = 10;
    else if (!isBullishTrend && rsiVal < 50) momentum = 10;
    else momentum = 5;
  } else if (rsiVal !== null) {
    if (isBullishTrend && rsiVal > 55) momentum = 10;
    else if (!isBullishTrend && rsiVal < 45) momentum = 10;
    else momentum = 5;
  }

  // Volume strength (10 pts)
  const avgVol = sma(volumes, 20) ?? volumes[volumes.length - 1];
  const volRatio = avgVol > 0 ? (volumes[volumes.length - 1] ?? 0) / avgVol : 1;
  if (volRatio > 1.5) volumeStrength = 10;
  else if (volRatio > 1.2) volumeStrength = 7;
  else if (volRatio > 1.0) volumeStrength = 5;
  else volumeStrength = 3;

  // ─── 7. Calculate Trade Levels ────────────────────────────────
  const atrVal = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const riskUnit = Math.max(atrVal * 1.5, ltp * 0.02);

  let entryZone: [number, number] | null = null;
  let stopLoss: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;
  let tp3: number | null = null;
  let direction: Direction = "NO TRADE";
  let entryType: EntryType | null = null;

  if (isBullishTrend) {
    direction = "LONG";
    // Entry: near demand zone or retest of broken resistance
    const demandBlock = orderBlocks.find((ob) => ob.type === "demand");
    if (demandBlock && ltp > demandBlock.high) {
      entryZone = [r2(demandBlock.high * 0.998), r2(ltp)];
      entryType = "Retest";
    } else if (structure.event === "BOS" && structure.direction === "bullish") {
      entryZone = [r2(ltp * 0.995), r2(ltp)];
      entryType = "Break of Structure";
    } else if (sweep === "sweep_low") {
      entryZone = [r2(ltp * 0.998), r2(ltp)];
      entryType = "Liquidity Sweep Entry";
    } else {
      entryZone = [r2(ltp * 0.997), r2(ltp)];
      entryType = "Breakout";
    }

    // SL: below nearest demand zone or 1.5×ATR below entry
    const slRef = demandBlock?.low ?? ltp - riskUnit;
    stopLoss = r2(Math.min(slRef, ltp - riskUnit));
    const risk = ltp - stopLoss;

    // Minimum R:R = 1:2.5
    tp1 = r2(ltp + risk * 2.5);
    tp2 = r2(ltp + risk * 3);
    tp3 = r2(ltp + risk * 4);
  } else {
    direction = "SHORT";
    const supplyBlock = orderBlocks.find((ob) => ob.type === "supply");
    if (supplyBlock && ltp < supplyBlock.low) {
      entryZone = [r2(ltp), r2(supplyBlock.low * 1.002)];
      entryType = "Retest";
    } else if (structure.event === "BOS" && structure.direction === "bearish") {
      entryZone = [r2(ltp), r2(ltp * 1.005)];
      entryType = "Break of Structure";
    } else if (sweep === "sweep_high") {
      entryZone = [r2(ltp), r2(ltp * 1.002)];
      entryType = "Liquidity Sweep Entry";
    } else {
      entryZone = [r2(ltp), r2(ltp * 1.003)];
      entryType = "Breakout";
    }

    const slRef = supplyBlock?.high ?? ltp + riskUnit;
    stopLoss = r2(Math.max(slRef, ltp + riskUnit));
    const risk = stopLoss - ltp;

    tp1 = r2(ltp - risk * 2.5);
    tp2 = r2(ltp - risk * 3);
    tp3 = r2(ltp - risk * 4);
  }

  // R:R quality (10 pts)
  const riskAmt = Math.abs(ltp - stopLoss);
  const reward = Math.abs(tp1 - ltp);
  const rr = riskAmt > 0 ? reward / riskAmt : 0;
  if (rr >= 3) riskRewardQuality = 10;
  else if (rr >= 2.5) riskRewardQuality = 8;
  else if (rr >= 2) riskRewardQuality = 5;
  else riskRewardQuality = 2;

  // ─── 8. Final Score ───────────────────────────────────────────
  const totalScore = trendAlignment + structureQuality + liquidityEvent +
    momentum + volumeStrength + riskRewardQuality;

  const scores = {
    trendAlignment,
    structureQuality,
    liquidityEvent,
    momentum,
    volumeStrength,
    riskRewardQuality,
  };

  // ─── 9. Trade Validity ────────────────────────────────────────
  const structureEventOut: InstitutionalSignal["structureEvent"] =
    structure.event ?? (sweep ? "Liquidity Sweep" : null);

  let tradeValid: "Valid" | "Invalid" = "Valid";
  let invalidReason: string | null = null;

  if (totalScore < 88) {
    tradeValid = "Invalid";
    invalidReason = `Confluence score ${totalScore}/100 < 88 threshold`;
  } else if (rr < 2.5) {
    tradeValid = "Invalid";
    invalidReason = `R:R ratio 1:${rr.toFixed(1)} < 1:2.5 minimum`;
  }

  // If invalid, set direction to NO TRADE
  if (tradeValid === "Invalid") {
    direction = "NO TRADE";
  }

  // ─── 10. Reasoning ────────────────────────────────────────────
  const reasoning = [
    `**Structure:** ${structure.event ? `${structure.event} (${structure.direction})` : "No major structure event"}.`,
    `**Liquidity:** ${liquidityZones.length} zone(s) detected${sweep ? `, sweep ${sweep === "sweep_high" ? "above equal highs" : "below equal lows"}` : ""}.`,
    `**Momentum:** RSI ${rsiVal?.toFixed(0) ?? "n/a"}, MACD ${macdVal ? (macdVal.hist > 0 ? "bullish" : "bearish") : "n/a"}.`,
    `**Volume:** ${volRatio.toFixed(1)}× average${volRatio > 1.5 ? " (spike)" : ""}.`,
    `**Risk:** R:R 1:${rr.toFixed(1)}, score ${totalScore}/100.`,
  ].join(" ");

  return {
    pair: symbol,
    marketRegime: regime,
    htfTrend,
    direction,
    entryType,
    entryZone,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward: r2(rr),
    confidenceScore: totalScore,
    liquidityZones,
    structureEvent: structureEventOut,
    orderBlocks,
    scores,
    reasoning,
    tradeValid,
    invalidReason,
  };
}
