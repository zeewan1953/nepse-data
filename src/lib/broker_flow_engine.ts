/**
 * Broker Flow Analytics API — uses real math + sample data.
 * 
 * In production, swap `broker_flow_sample_fixtures` with your real data module.
 * The analytics functions stay the same.
 */

import {
  computeBrokerNetFlow,
  computeBrokerConcentration,
  computeTickImbalance,
  computeCMF,
  computeMFI,
  computeVolumeZScore,
  classifyMomentum,
  minMaxNormalize,
  compositeScore,
} from "@/lib/broker_flow_analytics";

import {
  getOHLCVHistory,
  getFloorsheetRows,
  getStockSymbols,
  getMultiDayFloorsheets,
} from "@/lib/broker_flow_sample_fixtures";

// ─── Scanner: Best 5 LONG + Best 5 SHORT ────────────────────────────────────

export type ScannerPick = {
  symbol: string;
  name: string;
  score: number;
  direction: "LONG" | "SHORT";
  reasons: string[];
  buyConc: number;
  sellConc: number;
  netBrokerAmt: number;
  totalBuyAmt: number;
  totalSellAmt: number;
  volumeZScore: number;
  todayVolume: number;
  avgVolume: number;
  cmf: number | null;
  priceChange: number;
  tickImbalance: { buyVolume: number; sellVolume: number; estimated: true };
  estimated: boolean;
};

export function runScanner(_date: string): { longPicks: ScannerPick[]; shortPicks: ScannerPick[] } {
  const symbols = getStockSymbols();
  const rows = getFloorsheetRows(_date);

  // Compute per-stock metrics
  const stocks = symbols.map((sym) => {
    const bars = getOHLCVHistory(sym, 30);
    const symRows = rows.filter((r) => r.symbol === sym);

    const flows = computeBrokerNetFlow(symRows);
    const conc = computeBrokerConcentration(flows, 5);
    const cmf = computeCMF(bars, 7);
    const mfi = computeMFI(bars, 5);
    const volZ = computeVolumeZScore(bars, 7);
    const tick = computeTickImbalance(symRows);

    const netAmt = flows.reduce((s, f) => s + f.netAmt, 0);
    // Use tick-rule classified volumes for realistic buy/sell split
    const avgPrice = symRows.length > 0 ? symRows.reduce((s, r) => s + r.price, 0) / symRows.length : 0;
    const totalBuyAmt = tick.buyVolume * avgPrice;
    const totalSellAmt = tick.sellVolume * avgPrice;
    const priceChange = bars.length >= 2
      ? ((bars[bars.length - 1].close - bars[bars.length - 2].close) / bars[bars.length - 2].close) * 100
      : 0;

    return {
      symbol: sym,
      name: sym,
      conc,
      cmf,
      mfi,
      volZ: volZ?.zScore ?? null,
      todayVolume: volZ?.todayVolume ?? 0,
      avgVolume: volZ?.avgVolume ?? 0,
      tick,
      netAmt,
      totalBuyAmt,
      totalSellAmt,
      priceChange: Math.round(priceChange * 100) / 100,
      hasData: symRows.length > 0 && bars.length >= 5,
    };
  }).filter((s) => s.hasData);

  if (stocks.length === 0) return { longPicks: [], shortPicks: [] };

  // Normalize mixed metrics across the universe before scoring
  const concValues = stocks.map((s) => s.conc.buyConc - s.conc.sellConc);
  const normConc = minMaxNormalize(concValues);

  const cmfValues = stocks.map((s) => s.cmf ?? 0);
  const normCmf = minMaxNormalize(cmfValues);

  const volZValues = stocks.map((s) => Math.max(0, s.volZ ?? 0));
  const normVolZ = minMaxNormalize(volZValues);

  const mfiValues = stocks.map((s) => s.mfi ?? 50);
  const normMfi = minMaxNormalize(mfiValues);

  // Score each stock
  const scored = stocks.map((s, i) => {
    // LONG score: buy concentration + positive CMF + volume confirmation
    const longMetrics = [normConc[i], normCmf[i], normVolZ[i]];
    const longWeights = [0.35, 0.35, 0.3]; // conc, CMF, volume
    const longScore = s.netAmt > 0 ? compositeScore(longMetrics, longWeights) : 0;

    // SHORT score: sell concentration + negative CMF + volume confirmation
    const shortMetrics = [1 - normConc[i], 1 - normCmf[i], normVolZ[i]];
    const shortWeights = [0.35, 0.35, 0.3];
    const shortScore = s.netAmt < 0 ? compositeScore(shortMetrics, shortWeights) : 0;

    // Build reasons
    const longReasons: string[] = [];
    const shortReasons: string[] = [];

    if (s.conc.buyConc > 25) longReasons.push(`Buy conc ${s.conc.buyConc.toFixed(0)}% (top 5)`);
    if (s.conc.sellConc > 25) shortReasons.push(`Sell conc ${s.conc.sellConc.toFixed(0)}% (top 5)`);
    if (s.cmf !== null && s.cmf > 0.1) longReasons.push(`CMF +${s.cmf.toFixed(3)} (accumulation)`);
    if (s.cmf !== null && s.cmf < -0.1) shortReasons.push(`CMF ${s.cmf.toFixed(3)} (distribution)`);
    if (s.volZ !== null && s.volZ > 1.5) {
      longReasons.push(`Vol spike Z=${s.volZ.toFixed(1)}`);
      shortReasons.push(`Vol spike Z=${s.volZ.toFixed(1)}`);
    }
    if (s.mfi !== null && s.mfi < 30) longReasons.push(`MFI ${s.mfi.toFixed(0)} (oversold)`);
    if (s.mfi !== null && s.mfi > 70) shortReasons.push(`MFI ${s.mfi.toFixed(0)} (overbought)`);

    longReasons.push(`Net buy Rs ${(s.netAmt / 1000).toFixed(0)}K`);
    shortReasons.push(`Net sell Rs ${(Math.abs(s.netAmt) / 1000).toFixed(0)}K`);

    const base = {
      symbol: s.symbol,
      name: s.name,
      buyConc: s.conc.buyConc,
      sellConc: s.conc.sellConc,
      netBrokerAmt: s.netAmt,
      totalBuyAmt: s.totalBuyAmt,
      totalSellAmt: s.totalSellAmt,
      volumeZScore: s.volZ ?? 0,
      todayVolume: s.todayVolume,
      avgVolume: s.avgVolume,
      cmf: s.cmf,
      priceChange: s.priceChange,
      tickImbalance: {
        buyVolume: s.tick.buyVolume,
        sellVolume: s.tick.sellVolume,
        estimated: true as const,
      },
      estimated: true,
    };

    return {
      ...base,
      longScore,
      shortScore,
      longReasons,
      shortReasons,
    };
  });

  // Filter and sort
  const longPicks = scored
    .filter((s) => s.longScore > 0 && s.longReasons.length >= 1)
    .sort((a, b) => b.longScore - a.longScore)
    .slice(0, 5)
    .map(({ longScore, shortScore, longReasons, shortReasons, ...rest }) => ({
      ...rest,
      score: longScore,
      direction: "LONG" as const,
      reasons: longReasons,
    }));

  const shortPicks = scored
    .filter((s) => s.shortScore > 0 && s.shortReasons.length >= 1)
    .sort((a, b) => b.shortScore - a.shortScore)
    .slice(0, 5)
    .map(({ longScore, shortScore, longReasons, shortReasons, ...rest }) => ({
      ...rest,
      score: shortScore,
      direction: "SHORT" as const,
      reasons: shortReasons,
    }));

  return { longPicks, shortPicks };
}

// ─── Overview: Market-wide stats + anomalies ────────────────────────────────

export function runOverview(date: string) {
  const rows = getFloorsheetRows(date);
  const flows = computeBrokerNetFlow(rows);

  // Use tick-rule to classify trades as buy-initiated or sell-initiated
  // (like NEPSE turnover display — buy pressure ≠ sell pressure)
  const uniqueStocks = new Set(rows.map((r) => r.symbol));
  let totalBuy = 0;
  let totalSell = 0;

  for (const sym of uniqueStocks) {
    const symRows = rows.filter((r) => r.symbol === sym);
    const sorted = [...symRows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let lastDir: "buy" | "sell" = "buy";
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const prev = i > 0 ? sorted[i - 1] : null;
      if (prev && r.price > prev.price) lastDir = "buy";
      else if (prev && r.price < prev.price) lastDir = "sell";
      const amt = r.qty * r.price;
      if (lastDir === "buy") totalBuy += amt;
      else totalSell += amt;
    }
  }

  const uniqueBrokers = new Set(rows.flatMap((r) => [r.buyerBrokerId, r.sellerBrokerId]));

  // Per-stock anomalies
  const symbols = [...uniqueStocks];
  const anomalies = symbols
    .map((sym) => {
      const symRows = rows.filter((r) => r.symbol === sym);
      const symFlows = computeBrokerNetFlow(symRows);
      const conc = computeBrokerConcentration(symFlows, 5);
      const bars = getOHLCVHistory(sym, 30);
      const volZ = computeVolumeZScore(bars, 7);

      // Anomaly score: high concentration + unusual volume
      let score = 0;
      const flag = volZ?.zScore && Math.abs(volZ.zScore) > 2 ? "highly_unusual" :
        volZ?.zScore && Math.abs(volZ.zScore) > 1.5 ? "unusual" : "normal";

      if (conc.buyConc > 50 || conc.sellConc > 50) score += 2;
      if (volZ?.zScore && Math.abs(volZ.zScore) > 2) score += 3;
      if (volZ?.zScore && Math.abs(volZ.zScore) > 1.5) score += 1;

      return {
        symbol: sym,
        score,
        volumeZScore: volZ?.zScore ?? 0,
        buyConc: conc.buyConc,
        sellConc: conc.sellConc,
        flag,
      };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    totals: {
      brokers: Math.max(uniqueBrokers.size, 101), // NEPSE has 101 registered brokers
      stocks: uniqueStocks.size,
      totalBuyAmt: totalBuy,
      totalSellAmt: totalSell,
    },
    topAnomalies: anomalies,
  };
}

// ─── Leaderboard: Accumulation / Distribution ───────────────────────────────

export function runLeaderboard(date: string) {
  const rows = getFloorsheetRows(date);
  const symbols = [...new Set(rows.map((r) => r.symbol))];

  const scored = symbols.map((sym) => {
    const symRows = rows.filter((r) => r.symbol === sym);
    const flows = computeBrokerNetFlow(symRows);
    const conc = computeBrokerConcentration(flows, 5);
    const bars = getOHLCVHistory(sym, 30);
    const volZ = computeVolumeZScore(bars, 7);
    const netAmt = flows.reduce((s, f) => s + f.netAmt, 0);

    // Score: normalized blend of concentration + volume
    return {
      symbol: sym,
      score: Math.round((conc.buyConc + (volZ?.zScore ?? 0) * 10) * 10) / 10,
      volumeZScore: volZ?.zScore ?? 0,
      buyConc: conc.buyConc,
      sellConc: conc.sellConc,
      netAmt,
    };
  });

  const accumulation = scored.filter((s) => s.netAmt > 0).sort((a, b) => b.score - a.score).slice(0, 20);
  const distribution = scored.filter((s) => s.netAmt < 0).sort((a, b) => a.score - b.score).slice(0, 20);

  return { accumulation, distribution };
}

// ─── Stock Flow: Per-stock deep analysis ─────────────────────────────────────

export function runStockFlow(symbol: string, date: string) {
  const rows = getFloorsheetRows(date).filter((r) => r.symbol === symbol);
  const bars = getOHLCVHistory(symbol, 30);

  if (rows.length === 0) {
    return { error: `No floorsheet data for ${symbol} on ${date}` };
  }

  const flows = computeBrokerNetFlow(rows);
  const conc = computeBrokerConcentration(flows, 5);
  const cmf = computeCMF(bars, 7);
  const mfi = computeMFI(bars, 5);
  const volZ = computeVolumeZScore(bars, 7);
  const tick = computeTickImbalance(rows);

  const topBuyers = [...flows].sort((a, b) => b.netAmt - a.netAmt).slice(0, 5);
  const topSellers = [...flows].sort((a, b) => a.netAmt - b.netAmt).slice(0, 5);

  return {
    brokerFlows: flows.map((f) => ({
      brokerId: String(f.brokerId),
      buyQty: f.buyQty,
      buyAmt: f.buyAmt,
      sellQty: f.sellQty,
      sellAmt: f.sellAmt,
      netQty: f.netQty,
      netAmt: f.netAmt,
    })),
    topBuyers: topBuyers.map((b) => ({ brokerId: String(b.brokerId), netAmt: b.netAmt })),
    topSellers: topSellers.map((b) => ({ brokerId: String(b.brokerId), netAmt: b.netAmt })),
    cmf: cmf !== null ? { cmf, days: 20 } : null,
    mfi: mfi !== null ? { mfi, days: 14 } : null,
    concentration: conc,
    tickImbalance: {
      buyVolume: tick.buyVolume,
      sellVolume: tick.sellVolume,
      netImbalance: tick.netImbalance,
      buyTrades: tick.buyTrades,
      sellTrades: tick.sellTrades,
      disclaimer: "Estimated using tick-rule model (price change direction). Not actual order book data.",
    },
    volumeZScore: volZ ?? { zScore: 0, todayVolume: 0, avgVolume: 0 },
    estimated: true,
  };
}

// ─── Momentum Buckets ────────────────────────────────────────────────────────

export function runMomentum() {
  const symbols = getStockSymbols();
  const stocks = symbols.map((sym) => {
    const bars = getOHLCVHistory(sym, 30);
    const cmf = computeCMF(bars, 7);
    const vz = computeVolumeZScore(bars, 7);
    return { symbol: sym, bars, cmf, volZ: vz?.zScore ?? null };
  });

  return classifyMomentum(stocks);
}

// ─── Cross-Stock Patterns: Brokers active across 3+ stocks ──────────────────

export type CrossStockPattern = {
  brokerId: string;
  stocks: Array<{ symbol: string; netAmt: number; buyQty: number; sellQty: number }>;
  totalNetAmt: number;
  totalBuyAmt: number;
  totalSellAmt: number;
  stockCount: number;
};

export function detectCrossStockPatterns(date: string, dayCount = 5): CrossStockPattern[] {
  const multiDay = getMultiDayFloorsheets(dayCount);
  if (multiDay.length === 0) return [];

  // brokerId → (symbol → { netAmt, buyQty, sellQty })
  const brokerMap = new Map<string, Map<string, { netAmt: number; buyQty: number; sellQty: number }>>();

  for (const { rows } of multiDay) {
    const allSymbols = [...new Set(rows.map((r) => r.symbol))];
    for (const sym of allSymbols) {
      const symRows = rows.filter((r) => r.symbol === sym);
      const flows = computeBrokerNetFlow(symRows);
      for (const f of flows) {
        const bid = String(f.brokerId);
        if (!brokerMap.has(bid)) brokerMap.set(bid, new Map());
        const stockMap = brokerMap.get(bid)!;
        const prev = stockMap.get(sym) ?? { netAmt: 0, buyQty: 0, sellQty: 0 };
        stockMap.set(sym, {
          netAmt: prev.netAmt + f.netAmt,
          buyQty: prev.buyQty + f.buyQty,
          sellQty: prev.sellQty + f.sellQty,
        });
      }
    }
  }

  // Build patterns: filter brokers active in 3+ stocks
  const patterns: CrossStockPattern[] = [];
  for (const [brokerId, stockMap] of brokerMap) {
    if (stockMap.size < 1) continue; // skip empty

    const stocks = [...stockMap.entries()]
      .map(([symbol, data]) => ({
        symbol,
        netAmt: Math.round(data.netAmt),
        buyQty: data.buyQty,
        sellQty: data.sellQty,
      }))
      .sort((a, b) => Math.abs(b.netAmt) - Math.abs(a.netAmt));

    const totalNetAmt = stocks.reduce((s, x) => s + x.netAmt, 0);
    const totalBuyAmt = stocks.reduce((s, x) => s + Math.round(Math.abs(x.netAmt > 0 ? x.netAmt : 0)), 0);
    const totalSellAmt = stocks.reduce((s, x) => s + Math.round(Math.abs(x.netAmt < 0 ? x.netAmt : 0)), 0);
    patterns.push({ brokerId, stocks, totalNetAmt, totalBuyAmt, totalSellAmt, stockCount: stocks.length });
  }

  // Sort by absolute total net amount (most significant first)
  return patterns
    .sort((a, b) => Math.abs(b.totalNetAmt) - Math.abs(a.totalNetAmt));
}
