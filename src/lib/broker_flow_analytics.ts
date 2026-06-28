/**
 * Broker Flow Analytics — Pure math, no UI, no data fetching.
 * 
 * Input shapes:
 *   OHLCVBar       = { date, open, high, low, close, volume }
 *   FloorsheetRow  = { timestamp, symbol, qty, price, buyerBrokerId, sellerBrokerId }
 * 
 * Rules:
 *   - Insufficient history → returns null (never a fabricated number)
 *   - Broker net flow & concentration are EXACT (direct aggregation)
 *   - Tick-rule buy/sell volume is ESTIMATED (model, not fact)
 *   - Mixed-unit metrics are min-max normalized before blending into scores
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type OHLCVBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FloorsheetRow = {
  timestamp: string;
  symbol: string;
  qty: number;
  price: number;
  buyerBrokerId: number;
  sellerBrokerId: number;
};

export type BrokerNetFlow = {
  brokerId: number;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
};

export type BrokerConcentration = {
  buyConc: number;   // % of total buy amount from top-N brokers
  sellConc: number;  // % of total sell amount from top-N brokers
};

export type TickImbalance = {
  buyVolume: number;
  sellVolume: number;
  netImbalance: number;
  buyTrades: number;
  sellTrades: number;
  estimated: true;   // always true — tick rule is a model
};

export type MomentumBucket = {
  label: "New Uptrend" | "Continuing Up" | "Weakening" | "New Downtrend" | "Continuing Down" | "Recovering" | "Sideways";
  stocks: string[];
};

export type BrokerWinRate = {
  brokerId: number;
  trades: number;
  wins: number;
  winRate: number;   // 0..1
  avgReturn: number;  // %
};

// ─── Broker Net Flow (EXACT) ────────────────────────────────────────────────

/**
 * Aggregate exact broker net positions from floorsheet.
 * Every trade has a buyer and seller → net across all brokers sums to 0.
 */
export function computeBrokerNetFlow(rows: FloorsheetRow[]): BrokerNetFlow[] {
  const map = new Map<number, BrokerNetFlow>();

  for (const r of rows) {
    const amt = r.qty * r.price;

    // Buyer side
    let buyer = map.get(r.buyerBrokerId);
    if (!buyer) {
      buyer = { brokerId: r.buyerBrokerId, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, netQty: 0, netAmt: 0 };
      map.set(r.buyerBrokerId, buyer);
    }
    buyer.buyQty += r.qty;
    buyer.buyAmt += amt;

    // Seller side
    let seller = map.get(r.sellerBrokerId);
    if (!seller) {
      seller = { brokerId: r.sellerBrokerId, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, netQty: 0, netAmt: 0 };
      map.set(r.sellerBrokerId, seller);
    }
    seller.sellQty += r.qty;
    seller.sellAmt += amt;
  }

  // Compute net
  for (const b of map.values()) {
    b.netQty = b.buyQty - b.sellQty;
    b.netAmt = b.buyAmt - b.sellAmt;
  }

  return Array.from(map.values()).sort((a, b) => b.netAmt - a.netAmt);
}

/**
 * Invariant check: sum of all netAmt should be 0 (or near-zero from rounding).
 */
export function verifyNetFlowSumsToZero(flows: BrokerNetFlow[]): number {
  return flows.reduce((sum, f) => sum + f.netAmt, 0);
}

// ─── Broker Concentration (EXACT) ───────────────────────────────────────────

/**
 * What % of total buy/sell amount comes from the top-N brokers?
 * Returns values in [0, 100].
 */
export function computeBrokerConcentration(flows: BrokerNetFlow[], topN = 5): BrokerConcentration {
  const totalBuy = flows.reduce((s, f) => s + f.buyAmt, 0);
  const totalSell = flows.reduce((s, f) => s + f.sellAmt, 0);

  const topBuyers = [...flows].sort((a, b) => b.buyAmt - a.buyAmt).slice(0, topN);
  const topSellers = [...flows].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, topN);

  const topBuyAmt = topBuyers.reduce((s, f) => s + f.buyAmt, 0);
  const topSellAmt = topSellers.reduce((s, f) => s + f.sellAmt, 0);

  return {
    buyConc: totalBuy > 0 ? Math.round((topBuyAmt / totalBuy) * 10000) / 100 : 0,
    sellConc: totalSell > 0 ? Math.round((topSellAmt / totalSell) * 10000) / 100 : 0,
  };
}

// ─── Tick-Rule Order Flow (ESTIMATED) ────────────────────────────────────────

/**
 * Infer buy/sell aggression from price changes between consecutive trades.
 *   Price up   → buyer-initiated (aggressive buyer)
 *   Price down → seller-initiated (aggressive seller)
 *   Price same → inherit previous tick's direction
 * 
 * Returns estimated: true — this is a model, not a fact.
 */
export function computeTickImbalance(rows: FloorsheetRow[]): TickImbalance {
  if (rows.length === 0) {
    return { buyVolume: 0, sellVolume: 0, netImbalance: 0, buyTrades: 0, sellTrades: 0, estimated: true };
  }

  // Sort by timestamp
  const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let buyVolume = 0;
  let sellVolume = 0;
  let buyTrades = 0;
  let sellTrades = 0;
  let lastDirection: "buy" | "sell" = "buy";

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;

    if (prev && row.price > prev.price) {
      lastDirection = "buy";
    } else if (prev && row.price < prev.price) {
      lastDirection = "sell";
    }
    // else: price unchanged → inherit lastDirection

    if (lastDirection === "buy") {
      buyVolume += row.qty;
      buyTrades++;
    } else {
      sellVolume += row.qty;
      sellTrades++;
    }
  }

  return {
    buyVolume,
    sellVolume,
    netImbalance: buyVolume - sellVolume,
    buyTrades,
    sellTrades,
    estimated: true,
  };
}

// ─── Chaikin Money Flow (CMF) ────────────────────────────────────────────────

/**
 * CMF = Σ(Money Flow Volume) / Σ(Volume) over N periods.
 * Money Flow Multiplier = ((Close - Low) - (High - Close)) / (High - Low)
 * 
 * Range: [-1, +1]. Positive = accumulation, Negative = distribution.
 * Requires at least `period` bars → returns null otherwise.
 */
export function computeCMF(bars: OHLCVBar[], period = 7): number | null {
  if (bars.length < period) return null;

  const slice = bars.slice(-period);
  let mfvSum = 0;
  let volSum = 0;

  for (const b of slice) {
    const range = b.high - b.low;
    if (range <= 0) continue; // skip bars where high === low
    const mfm = ((b.close - b.low) - (b.high - b.close)) / range;
    mfvSum += mfm * b.volume;
    volSum += b.volume;
  }

  if (volSum === 0) return null;
  const cmf = mfvSum / volSum;

  // Clamp to [-1, 1] for safety
  return Math.max(-1, Math.min(1, Math.round(cmf * 1000) / 1000));
}

// ─── Money Flow Index (MFI) ──────────────────────────────────────────────────

/**
 * MFI = 100 - (100 / (1 + Money Ratio))
 * Money Ratio = Σ(Positive Money Flow) / Σ(Negative Money Flow) over N periods
 * Raw Money Flow = Typical Price × Volume
 * Typical Price = (High + Low + Close) / 3
 * 
 * Range: [0, 100]. >80 overbought, <20 oversold.
 * Requires at least `period + 1` bars → returns null otherwise.
 */
export function computeMFI(bars: OHLCVBar[], period = 5): number | null {
  if (bars.length < period + 1) return null;

  const slice = bars.slice(-(period + 1));
  let posFlow = 0;
  let negFlow = 0;

  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    const prevTP = (prev.high + prev.low + prev.close) / 3;
    const currTP = (curr.high + curr.low + curr.close) / 3;
    const rawMF = currTP * curr.volume;

    if (currTP > prevTP) {
      posFlow += rawMF;
    } else if (currTP < prevTP) {
      negFlow += rawMF;
    }
    // equal → ignore
  }

  if (negFlow === 0) return posFlow > 0 ? 100 : 50;
  const ratio = posFlow / negFlow;
  return Math.round((100 - 100 / (1 + ratio)) * 100) / 100;
}

// ─── Volume Z-Score ──────────────────────────────────────────────────────────

/**
 * Z = (todayVolume - avgVolume) / stddev
 * |Z| > 2 = unusual volume.
 * Needs at least `lookback` bars → returns null otherwise.
 */
export function computeVolumeZScore(bars: OHLCVBar[], lookback = 7): { zScore: number; todayVolume: number; avgVolume: number } | null {
  if (bars.length < lookback + 1) return null;

  const historical = bars.slice(-(lookback + 1), -1);
  const today = bars[bars.length - 1];

  const avg = historical.reduce((s, b) => s + b.volume, 0) / historical.length;
  if (avg === 0) return null;

  const variance = historical.reduce((s, b) => s + (b.volume - avg) ** 2, 0) / historical.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return { zScore: 0, todayVolume: today.volume, avgVolume: avg };

  return {
    zScore: Math.round(((today.volume - avg) / stddev) * 100) / 100,
    todayVolume: today.volume,
    avgVolume: Math.round(avg),
  };
}

// ─── Price Momentum Classification ───────────────────────────────────────────

/**
 * Classify stocks into momentum buckets based on price trend + volume confirmation.
 * 
 * Buckets:
 *   "New Uptrend"      — price turned up + volume spike (Z > 1.5)
 *   "Continuing Up"    — price up + CMF positive
 *   "Weakening"        — price up but CMF negative (divergence)
 *   "New Downtrend"    — price turned down + volume spike
 *   "Continuing Down"  — price down + CMF negative
 *   "Recovering"       — price down but CMF positive (divergence)
 *   "Sideways"         — no clear direction
 * 
 * Buckets can have fewer than 5 stocks, including zero.
 */
export function classifyMomentum(
  stocks: Array<{ symbol: string; bars: OHLCVBar[]; cmf: number | null; volZ: number | null }>
): MomentumBucket[] {
  const buckets: Record<MomentumBucket["label"], string[]> = {
    "New Uptrend": [],
    "Continuing Up": [],
    "Weakening": [],
    "New Downtrend": [],
    "Continuing Down": [],
    "Recovering": [],
    "Sideways": [],
  };

  for (const s of stocks) {
    if (s.bars.length < 3) continue;

    const last = s.bars[s.bars.length - 1];
    const prev = s.bars[s.bars.length - 2];
    const prev2 = s.bars[s.bars.length - 3];

    const priceUp = last.close > prev.close;
    const priceWasUp = prev.close > prev2.close;
    const priceTurnedUp = priceUp && !priceWasUp;
    const priceTurnedDown = !priceUp && priceWasUp;
    const volSpike = s.volZ !== null && s.volZ > 1.5;
    const cmfPos = s.cmf !== null && s.cmf > 0;
    const cmfNeg = s.cmf !== null && s.cmf < 0;

    if (priceTurnedUp && volSpike) {
      buckets["New Uptrend"].push(s.symbol);
    } else if (priceUp && cmfPos) {
      buckets["Continuing Up"].push(s.symbol);
    } else if (priceUp && cmfNeg) {
      buckets["Weakening"].push(s.symbol);
    } else if (priceTurnedDown && volSpike) {
      buckets["New Downtrend"].push(s.symbol);
    } else if (!priceUp && cmfNeg) {
      buckets["Continuing Down"].push(s.symbol);
    } else if (!priceUp && cmfPos) {
      buckets["Recovering"].push(s.symbol);
    } else {
      buckets["Sideways"].push(s.symbol);
    }
  }

  return (Object.entries(buckets) as [MomentumBucket["label"], string[]][])
    .map(([label, stocks]) => ({ label, stocks }));
}

// ─── Broker Win Rate (Real Backtest) ─────────────────────────────────────────

/**
 * For each day a broker's net position exceeds minTradeValue,
 * check if price moved the same direction forwardDays later.
 * 
 * This is a real backtest, not a heuristic.
 */
export function computeBrokerWinRate(
  brokerId: number,
  floorsheets: Array<{ date: string; rows: FloorsheetRow[] }>,
  ohlcvByDate: Map<string, OHLCVBar>,
  opts: { minTradeValue?: number; forwardDays?: number } = {}
): BrokerWinRate | null {
  const { minTradeValue = 100000, forwardDays = 3 } = opts;

  // Get per-day net for this broker
  const dailyNets: Array<{ date: string; netAmt: number }> = [];
  for (const fs of floorsheets) {
    let netAmt = 0;
    for (const r of fs.rows) {
      if (r.buyerBrokerId === brokerId) netAmt += r.qty * r.price;
      if (r.sellerBrokerId === brokerId) netAmt -= r.qty * r.price;
    }
    if (Math.abs(netAmt) >= minTradeValue) {
      dailyNets.push({ date: fs.date, netAmt });
    }
  }

  if (dailyNets.length === 0) return null;

  // Sort dates
  const sortedDates = [...ohlcvByDate.keys()].sort();
  let wins = 0;
  let trades = 0;
  let totalReturn = 0;

  for (const dn of dailyNets) {
    const idx = sortedDates.indexOf(dn.date);
    if (idx < 0 || idx + forwardDays >= sortedDates.length) continue;

    const entryBar = ohlcvByDate.get(dn.date);
    const exitBar = ohlcvByDate.get(sortedDates[idx + forwardDays]);
    if (!entryBar || !exitBar) continue;

    const returnPct = ((exitBar.close - entryBar.close) / entryBar.close) * 100;
    const direction = dn.netAmt > 0 ? 1 : -1; // long or short

    trades++;
    totalReturn += returnPct * direction;
    if (returnPct * direction > 0) wins++;
  }

  if (trades === 0) return null;

  return {
    brokerId,
    trades,
    wins,
    winRate: Math.round((wins / trades) * 100) / 100,
    avgReturn: Math.round((totalReturn / trades) * 100) / 100,
  };
}

// ─── Min-Max Normalization ───────────────────────────────────────────────────

/**
 * Normalize values to [0, 1] across a universe.
 * Use this before blending mixed-unit metrics (% vs ratio vs z-score) into a score.
 */
export function minMaxNormalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => Math.round(((v - min) / range) * 1000) / 1000);
}

// ─── Net Flow Streak Detection ────────────────────────────────────────────────

export type BrokerDailyRecord = {
  tradeDate: string;
  purchaseAmt: number;
  sellAmt: number;
  netAmt: number;
  totalAmt: number;
};

export type NetFlowStreak = {
  direction: "buy" | "sell";
  length: number;
};

/**
 * Compute the current net-flow streak for a broker from their daily records.
 * Records must be sorted ascending by tradeDate.
 * Returns null if fewer than 2 records.
 */
export function computeNetFlowStreak(records: BrokerDailyRecord[]): NetFlowStreak | null {
  if (records.length < 2) return null;

  const sorted = [...records].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const reversed = sorted.reverse();

  let length = 0;
  let direction: "buy" | "sell" | null = null;

  for (const r of reversed) {
    if (r.netAmt > 0) {
      if (direction === null) { direction = "buy"; length = 1; }
      else if (direction === "buy") length++;
      else break;
    } else if (r.netAmt < 0) {
      if (direction === null) { direction = "sell"; length = 1; }
      else if (direction === "sell") length++;
      else break;
    } else {
      // net zero day — streak ends
      break;
    }
  }

  return direction ? { direction, length } : null;
}

// ─── Composite Score (normalized blend) ──────────────────────────────────────

/**
 * Blend normalized metrics into a single 0-100 score.
 * weights must sum to 1 (or close to it).
 */
export function compositeScore(
  normalizedMetrics: number[],
  weights: number[]
): number {
  if (normalizedMetrics.length !== weights.length) return 0;
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return 0;

  let score = 0;
  for (let i = 0; i < normalizedMetrics.length; i++) {
    score += normalizedMetrics[i] * (weights[i] / sum);
  }
  return Math.round(score * 100);
}
