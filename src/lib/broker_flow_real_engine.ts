/**
 * Real-data broker flow engine — async functions that query the DB.
 *
 * Each function mirrors the synchronous sample-data engine in
 * broker_flow_engine.ts, returning the same shapes so the API routes
 * can swap between real and sample data transparently.
 */

import {
  computeBrokerNetFlow,
  computeBrokerConcentration,
  computeTickImbalance,
  computeCMF,
  computeMFI,
  computeVolumeZScore,
  minMaxNormalize,
  compositeScore,
  type FloorsheetRow,
  type OHLCVBar,
  type BrokerNetFlow,
} from "@/lib/broker_flow_analytics";

import {
  getRealBrokerAgg,
  getRealMultiDayBrokerAgg,
  getRealOHLCV,
  getRealTrades,
  getLastNTradingDates,
  getTradedSymbols,
  hasRealData,
  aggToFloorsheetRows,
  type BrokerAggRow,
} from "@/lib/broker_flow_real_data";

// Re-export types from the sample engine so routes can use one import
export type { ScannerPick, CrossStockPattern } from "@/lib/broker_flow_engine";
import type { ScannerPick, CrossStockPattern } from "@/lib/broker_flow_engine";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Group agg rows by symbol, then compute broker net flow per symbol.
 */
function flowsFromAgg(
  aggRows: BrokerAggRow[],
  symbol: string
): BrokerNetFlow[] {
  const symRows = aggRows.filter((r) => r.stockSymbol === symbol);
  const rows = aggToFloorsheetRows(symRows);
  return computeBrokerNetFlow(rows);
}

/**
 * Compute per-stock net amount from agg rows (fast path, no FloorsheetRow conversion).
 */
function stockNetFromAgg(aggRows: BrokerAggRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of aggRows) {
    const prev = map.get(a.stockSymbol) ?? 0;
    map.set(a.stockSymbol, prev + (a.buyAmt - a.sellAmt));
  }
  return map;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

export async function runRealScanner(
  date: string
): Promise<{ longPicks: ScannerPick[]; shortPicks: ScannerPick[] }> {
  const aggRows = await getRealBrokerAgg(date);
  if (aggRows.length === 0) return { longPicks: [], shortPicks: [] };

  const symbols = [...new Set(aggRows.map((r) => r.stockSymbol))];

  const stocks = [];
  for (const sym of symbols) {
    const flows = flowsFromAgg(aggRows, sym);
    const conc = computeBrokerConcentration(flows, 5);
    const bars = await getRealOHLCV(sym, 30);
    const volZ = computeVolumeZScore(bars, 7);

    // Tick-rule from raw trades (if available)
    let tick = { buyVolume: 0, sellVolume: 0, netImbalance: 0, buyTrades: 0, sellTrades: 0, estimated: true as const };
    try {
      const trades = await getRealTrades(date, sym);
      if (trades.length > 0) tick = computeTickImbalance(trades);
    } catch { /* ok */ }

    const netAmt = flows.reduce((s, f) => s + f.netAmt, 0);
    const avgPrice = flows.length > 0
      ? flows.reduce((s, f) => s + f.buyAmt + f.sellAmt, 0) / flows.reduce((s, f) => s + f.buyQty + f.sellQty, 0)
      : 0;
    const totalBuyAmt = tick.buyVolume * avgPrice;
    const totalSellAmt = tick.sellVolume * avgPrice;

    const priceChange = bars.length >= 2
      ? ((bars[bars.length - 1].close - bars[bars.length - 2].close) / bars[bars.length - 2].close) * 100
      : 0;

    stocks.push({
      symbol: sym, name: sym, conc,
      cmf: computeCMF(bars, 7),
      mfi: computeMFI(bars, 5),
      volZ: volZ?.zScore ?? null,
      todayVolume: volZ?.todayVolume ?? 0,
      avgVolume: volZ?.avgVolume ?? 0,
      tick, netAmt, totalBuyAmt, totalSellAmt,
      priceChange: Math.round(priceChange * 100) / 100,
      hasData: bars.length >= 5,
    });
  }

  const valid = stocks.filter((s) => s.hasData);
  if (valid.length === 0) return { longPicks: [], shortPicks: [] };

  // Normalize + score (same logic as sample engine)
  const concValues = valid.map((s) => s.conc.buyConc - s.conc.sellConc);
  const normConc = minMaxNormalize(concValues);
  const cmfValues = valid.map((s) => s.cmf ?? 0);
  const normCmf = minMaxNormalize(cmfValues);
  const volZValues = valid.map((s) => Math.max(0, s.volZ ?? 0));
  const normVolZ = minMaxNormalize(volZValues);

  const scored = valid.map((s, i) => {
    const longMetrics = [normConc[i], normCmf[i], normVolZ[i]];
    const longWeights = [0.35, 0.35, 0.3];
    const longScore = s.netAmt > 0 ? compositeScore(longMetrics, longWeights) : 0;

    const shortMetrics = [1 - normConc[i], 1 - normCmf[i], normVolZ[i]];
    const shortWeights = [0.35, 0.35, 0.3];
    const shortScore = s.netAmt < 0 ? compositeScore(shortMetrics, shortWeights) : 0;

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
    longReasons.push(`Net buy Rs ${(s.netAmt / 1000).toFixed(0)}K`);
    shortReasons.push(`Net sell Rs ${(Math.abs(s.netAmt) / 1000).toFixed(0)}K`);

    const base = {
      symbol: s.symbol, name: s.name,
      buyConc: s.conc.buyConc, sellConc: s.conc.sellConc,
      netBrokerAmt: s.netAmt,
      totalBuyAmt: s.totalBuyAmt, totalSellAmt: s.totalSellAmt,
      volumeZScore: s.volZ ?? 0,
      todayVolume: s.todayVolume, avgVolume: s.avgVolume,
      cmf: s.cmf, priceChange: s.priceChange,
      tickImbalance: { buyVolume: s.tick.buyVolume, sellVolume: s.tick.sellVolume, estimated: true as const },
      estimated: false,
    };
    return { ...base, longScore, shortScore, longReasons, shortReasons };
  });

  const longPicks = scored
    .filter((s) => s.longScore > 0 && s.longReasons.length >= 1)
    .sort((a, b) => b.longScore - a.longScore)
    .slice(0, 5)
    .map(({ longScore, shortScore, longReasons, shortReasons, ...rest }) => ({
      ...rest, score: longScore, direction: "LONG" as const, reasons: longReasons,
    }));

  const shortPicks = scored
    .filter((s) => s.shortScore > 0 && s.shortReasons.length >= 1)
    .sort((a, b) => b.shortScore - a.shortScore)
    .slice(0, 5)
    .map(({ longScore, shortScore, longReasons, shortReasons, ...rest }) => ({
      ...rest, score: shortScore, direction: "SHORT" as const, reasons: shortReasons,
    }));

  return { longPicks, shortPicks };
}

// ─── Overview ───────────────────────────────────────────────────────────────

export async function runRealOverview(date: string) {
  const aggRows = await getRealBrokerAgg(date);
  if (aggRows.length === 0) return null;

  const symbols = [...new Set(aggRows.map((r) => r.stockSymbol))];
  const brokers = new Set(aggRows.map((r) => r.brokerId));

  // Use tick-rule for realistic buy/sell totals
  let totalBuy = 0;
  let totalSell = 0;
  for (const sym of symbols) {
    try {
      const trades = await getRealTrades(date, sym);
      if (trades.length === 0) continue;
      const sorted = [...trades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
    } catch {
      // Fallback: use agg amounts
      const symAgg = aggRows.filter((r) => r.stockSymbol === sym);
      for (const a of symAgg) {
        totalBuy += a.buyAmt;
        totalSell += a.sellAmt;
      }
    }
  }

  // Per-stock anomalies
  const anomalies = [];
  for (const sym of symbols) {
    const flows = flowsFromAgg(aggRows, sym);
    const conc = computeBrokerConcentration(flows, 5);
    const bars = await getRealOHLCV(sym, 30);
    const volZ = computeVolumeZScore(bars, 7);

    let score = 0;
    const flag = volZ?.zScore && Math.abs(volZ.zScore) > 2 ? "highly_unusual"
      : volZ?.zScore && Math.abs(volZ.zScore) > 1.5 ? "unusual" : "normal";

    if (conc.buyConc > 50 || conc.sellConc > 50) score += 2;
    if (volZ?.zScore && Math.abs(volZ.zScore) > 2) score += 3;
    if (volZ?.zScore && Math.abs(volZ.zScore) > 1.5) score += 1;

    if (score > 0) {
      anomalies.push({
        symbol: sym, score,
        volumeZScore: volZ?.zScore ?? 0,
        buyConc: conc.buyConc, sellConc: conc.sellConc, flag,
      });
    }
  }
  anomalies.sort((a, b) => b.score - a.score);

  return {
    totals: {
      brokers: brokers.size,
      stocks: symbols.length,
      totalBuyAmt: totalBuy,
      totalSellAmt: totalSell,
    },
    topAnomalies: anomalies.slice(0, 10),
  };
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function runRealLeaderboard(date: string) {
  const aggRows = await getRealBrokerAgg(date);
  if (aggRows.length === 0) return null;

  const symbols = [...new Set(aggRows.map((r) => r.stockSymbol))];

  const scored = [];
  for (const sym of symbols) {
    const flows = flowsFromAgg(aggRows, sym);
    const conc = computeBrokerConcentration(flows, 5);
    const bars = await getRealOHLCV(sym, 30);
    const volZ = computeVolumeZScore(bars, 7);
    const netAmt = flows.reduce((s, f) => s + f.netAmt, 0);

    scored.push({
      symbol: sym,
      score: Math.round((conc.buyConc + (volZ?.zScore ?? 0) * 10) * 10) / 10,
      volumeZScore: volZ?.zScore ?? 0,
      buyConc: conc.buyConc,
      sellConc: conc.sellConc,
      netAmt,
    });
  }

  const accumulation = scored.filter((s) => s.netAmt > 0).sort((a, b) => b.score - a.score).slice(0, 20);
  const distribution = scored.filter((s) => s.netAmt < 0).sort((a, b) => a.score - b.score).slice(0, 20);

  return { accumulation, distribution };
}

// ─── Stock Flow ─────────────────────────────────────────────────────────────

export async function runRealStockFlow(symbol: string, date: string) {
  // Get raw trades for tick-rule + broker flow
  let trades: FloorsheetRow[] = [];
  try { trades = await getRealTrades(date, symbol); } catch { /* ok */ }

  // Fallback to agg data if no raw trades
  let flows: BrokerNetFlow[];
  if (trades.length > 0) {
    flows = computeBrokerNetFlow(trades);
  } else {
    const aggRows = await getRealBrokerAgg(date);
    const symRows = aggRows.filter((r) => r.stockSymbol === symbol);
    if (symRows.length === 0) {
      return { error: `No floorsheet data for ${symbol} on ${date}` };
    }
    flows = computeBrokerNetFlow(aggToFloorsheetRows(symRows));
  }

  const bars = await getRealOHLCV(symbol, 30);
  const conc = computeBrokerConcentration(flows, 5);
  const cmf = computeCMF(bars, 7);
  const mfi = computeMFI(bars, 5);
  const volZ = computeVolumeZScore(bars, 7);
  const tick = trades.length > 0
    ? computeTickImbalance(trades)
    : { buyVolume: 0, sellVolume: 0, netImbalance: 0, buyTrades: 0, sellTrades: 0, estimated: true as const };

  const topBuyers = [...flows].sort((a, b) => b.netAmt - a.netAmt).slice(0, 5);
  const topSellers = [...flows].sort((a, b) => a.netAmt - b.netAmt).slice(0, 5);

  return {
    brokerFlows: flows.map((f) => ({
      brokerId: String(f.brokerId),
      buyQty: f.buyQty, buyAmt: f.buyAmt,
      sellQty: f.sellQty, sellAmt: f.sellAmt,
      netQty: f.netQty, netAmt: f.netAmt,
    })),
    topBuyers: topBuyers.map((b) => ({ brokerId: String(b.brokerId), netAmt: b.netAmt })),
    topSellers: topSellers.map((b) => ({ brokerId: String(b.brokerId), netAmt: b.netAmt })),
    cmf: cmf !== null ? { cmf, days: 20 } : null,
    mfi: mfi !== null ? { mfi, days: 14 } : null,
    concentration: conc,
    tickImbalance: {
      buyVolume: tick.buyVolume, sellVolume: tick.sellVolume,
      netImbalance: tick.netImbalance,
      buyTrades: tick.buyTrades, sellTrades: tick.sellTrades,
      disclaimer: "Estimated using tick-rule model (price change direction). Not actual order book data.",
    },
    volumeZScore: volZ ?? { zScore: 0, todayVolume: 0, avgVolume: 0 },
    estimated: trades.length === 0,
  };
}

// ─── Cross-Stock Patterns ───────────────────────────────────────────────────

export async function detectRealCrossStockPatterns(
  date: string,
  dayCount = 5
): Promise<CrossStockPattern[]> {
  const dates = await getLastNTradingDates(date, dayCount);
  if (dates.length === 0) return [];

  const allAgg = await getRealMultiDayBrokerAgg(dates);
  if (allAgg.length === 0) return [];

  // brokerId → (symbol → { netAmt, buyQty, sellQty })
  const brokerMap = new Map<string, Map<string, { netAmt: number; buyQty: number; sellQty: number }>>();

  for (const a of allAgg) {
    const bid = a.brokerId;
    if (!brokerMap.has(bid)) brokerMap.set(bid, new Map());
    const stockMap = brokerMap.get(bid)!;
    const prev = stockMap.get(a.stockSymbol) ?? { netAmt: 0, buyQty: 0, sellQty: 0 };
    stockMap.set(a.stockSymbol, {
      netAmt: prev.netAmt + (a.buyAmt - a.sellAmt),
      buyQty: prev.buyQty + a.buyQty,
      sellQty: prev.sellQty + a.sellQty,
    });
  }

  const patterns: CrossStockPattern[] = [];
  for (const [brokerId, stockMap] of brokerMap) {
    if (stockMap.size < 1) continue;

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

  return patterns.sort((a, b) => Math.abs(b.totalNetAmt) - Math.abs(a.totalNetAmt));
}
