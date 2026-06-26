import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { buildSignalsFromLiveData } from "@/lib/signal-engine";
import { computeTacticalSignal } from "@/lib/tactical-signals";
import { db } from "@/lib/db";

export type StockAnalysis = {
  symbol: string;
  name: string;
  date: string;
  price: {
    ltp: number;
    open: number;
    high: number;
    low: number;
    change: number;
    changePct: number;
    rangePosition: number; // 0-1 where LTP sits in day's range
    volatility: number; // day range as % of open
    avgTradeSize: number; // turnover / quantity
  };
  trend: {
    shortTerm: "BULLISH" | "BEARISH" | "NEUTRAL";
    momentum: number; // -100 to +100
    strength: number; // 0-100 confidence in trend
    consecutiveUp: number;
    consecutiveDown: number;
  };
  volume: {
    total: number;
    turnover: number;
    relativeToAvg: number; // vs market median
    quality: "HIGH" | "NORMAL" | "LOW";
    surge: boolean;
  };
  signal: {
    direction: "BUY" | "SELL" | "NEUTRAL" | null;
    confidence: number;
    reason: string;
    technical: {
      momentumScore: number;
      rangePosition: number;
      volumeRatio: number;
      intradayStrength: number;
    } | null;
  };
  brokerFlow: {
    totalBuy: number;
    totalSell: number;
    netFlow: number;
    buyBrokers: number;
    sellBrokers: number;
    topBuyer: { broker: string; amt: number } | null;
    topSeller: { broker: string; amt: number } | null;
  } | null;
  supportResistance: {
    support: number;
    resistance: number;
    pivot: number;
    nearSupport: boolean;
    nearResistance: boolean;
  };
  verdict: {
    rating: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
    score: number; // -100 to +100
    summary: string;
    action: string;
    riskReward: string;
  };
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export async function analyseStock(symbol: string): Promise<StockAnalysis | { error: string }> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail?.length) {
    return { error: "Market data unavailable" };
  }

  const stock = mero.turnover.detail.find((s: any) => s.s === symbol);
  if (!stock) {
    return { error: `Symbol "${symbol}" not found in NEPSE live data` };
  }

  const allVolumes = mero.turnover.detail.map((s: any) => s.q);
  const allTurnovers = mero.turnover.detail.map((s: any) => s.t);

  // ——— Price Analysis ———
  const range = stock.h - stock.l;
  const rangePos = range > 0 ? clamp((stock.lp - stock.l) / range, 0, 1) : 0.5;
  const volatility = stock.op > 0 ? range / stock.op : 0;
  const avgTradeSize = stock.q > 0 ? stock.t / stock.q : 0;
  const chgPct = stock.pc || 0;

  // ——— Trend ———
  const medVol = allVolumes.filter((v: number) => v > 0).sort((a: number, b: number) => a - b)[Math.floor(allVolumes.filter((v: number) => v > 0).length / 2)] || 1;
  const volRatio = stock.q / medVol;

  let trendScore = 0;
  let trendFactors = 0;

  // Momentum contribution
  if (chgPct !== 0) {
    trendScore += clamp((chgPct / 10) * 40, -40, 40);
    trendFactors++;
  }
  // Range position contribution
  trendScore += (rangePos - 0.5) * 2 * 30;
  trendFactors++;
  // Volume confirmation
  if (volRatio > 1.3) {
    trendScore += (chgPct >= 0 ? 1 : -1) * clamp((volRatio - 1) * 15, 0, 30);
    trendFactors++;
  }

  const finalTrendScore = trendFactors > 0 ? trendScore / trendFactors : 0;
  const trendStrength = clamp(Math.abs(finalTrendScore) + (volRatio > 2 ? 10 : 0) + (volatility > 0.04 ? 5 : 0), 0, 100);

  let shortTerm: "BULLISH" | "BEARISH" | "NEUTRAL";
  if (finalTrendScore > 15) shortTerm = "BULLISH";
  else if (finalTrendScore < -15) shortTerm = "BEARISH";
  else shortTerm = "NEUTRAL";

  // ——— Volume ———
  const medTurnover = allTurnovers.filter((v: number) => v > 0).sort((a: number, b: number) => a - b)[Math.floor(allTurnovers.filter((v: number) => v > 0).length / 2)] || 1;
  const turnoverRatio = stock.t / medTurnover;

  let volumeQuality: "HIGH" | "NORMAL" | "LOW";
  if (volRatio > 2) volumeQuality = "HIGH";
  else if (volRatio < 0.3) volumeQuality = "LOW";
  else volumeQuality = "NORMAL";

  // ——— Signal ———
  const { signals } = await buildSignalsFromLiveData();
  const sig = signals.find((s) => s.symbol === symbol);
  const tactical = sig?.tactical || null;

  // ——— Broker Flow (from MeroLagani broker data) ———
  let brokerFlow: StockAnalysis["brokerFlow"] = null;
  try {
    if (mero.broker?.detail?.length) {
      const brokers = mero.broker.detail;
      const totalBuy = brokers.reduce((s: number, b: any) => s + (b.p || 0), 0);
      const totalSell = brokers.reduce((s: number, b: any) => s + (b.s || 0), 0);
      const buyBrokers = brokers.filter((b: any) => (b.p || 0) > 0).length;
      const sellBrokers = brokers.filter((b: any) => (b.s || 0) > 0).length;
      const sortedByBuy = [...brokers].sort((a: any, b: any) => (b.p || 0) - (a.p || 0));
      const sortedBySell = [...brokers].sort((a: any, b: any) => (b.s || 0) - (a.s || 0));

      brokerFlow = {
        totalBuy, totalSell, netFlow: totalBuy - totalSell,
        buyBrokers, sellBrokers,
        topBuyer: sortedByBuy[0] ? { broker: String(sortedByBuy[0].b), amt: sortedByBuy[0].p } : null,
        topSeller: sortedBySell[0] ? { broker: String(sortedBySell[0].b), amt: sortedBySell[0].s } : null,
      };
    }
  } catch {}

  // ——— Support / Resistance ———
  const pivot = (stock.h + stock.l + stock.lp) / 3;
  const support = stock.l - (stock.h - stock.l) * 0.5;
  const resistance = stock.h + (stock.h - stock.l) * 0.5;
  const nearSupport = stock.lp <= stock.l * 1.02;
  const nearResistance = stock.lp >= stock.h * 0.98;

  // ——— Verdict ———
  let score = finalTrendScore;

  // Bonus for volume confirmation
  if (volRatio > 2 && chgPct > 0) score += 15;
  else if (volRatio > 2 && chgPct < 0) score -= 15;

  // Bonus for signal alignment
  if (sig?.signal === "BUY" && shortTerm === "BULLISH") score += 10;
  else if (sig?.signal === "SELL" && shortTerm === "BEARISH") score -= 10;

  // Bonus for broker flow
  if (brokerFlow) {
    if (brokerFlow.netFlow > 0) score += 5;
    else if (brokerFlow.netFlow < 0) score -= 5;
  }

  score = clamp(score, -100, 100);

  let rating: StockAnalysis["verdict"]["rating"];
  if (score >= 40) rating = "STRONG_BUY";
  else if (score >= 15) rating = "BUY";
  else if (score <= -40) rating = "STRONG_SELL";
  else if (score <= -15) rating = "SELL";
  else rating = "NEUTRAL";

  // Build summary text
  const summaryParts: string[] = [];
  if (chgPct > 2) summaryParts.push(`Strongly up ${chgPct.toFixed(1)}%`);
  else if (chgPct > 0.5) summaryParts.push(`Slightly up ${chgPct.toFixed(1)}%`);
  else if (chgPct < -2) summaryParts.push(`Sharply down ${Math.abs(chgPct).toFixed(1)}%`);
  else if (chgPct < -0.5) summaryParts.push(`Slightly down ${Math.abs(chgPct).toFixed(1)}%`);

  if (rangePos > 0.8) summaryParts.push("trading near day high");
  else if (rangePos < 0.2) summaryParts.push("trading near day low");

  if (volRatio > 2.5) summaryParts.push(`volume ${volRatio.toFixed(1)}x market avg (massive)`);
  else if (volRatio > 1.5) summaryParts.push(`volume ${volRatio.toFixed(1)}x market avg`);

  if (volatility > 0.05) summaryParts.push("high volatility");

  // Action text
  let action = "";
  if (rating === "STRONG_BUY" || rating === "BUY") {
    action = `Consider buying near support Rs ${support.toFixed(2)}. SL at Rs ${(stock.lp * 0.95).toFixed(2)}. Targets: Rs ${(stock.lp * 1.05).toFixed(2)} / ${(stock.lp * 1.10).toFixed(2)} / ${(stock.lp * 1.15).toFixed(2)}.`;
  } else if (rating === "STRONG_SELL" || rating === "SELL") {
    action = `Consider selling near resistance Rs ${resistance.toFixed(2)}. Place stop above Rs ${(stock.lp * 1.05).toFixed(2)}.`;
  } else {
    action = "Wait for clearer direction. Entry if breaks above resistance or holds support.";
  }

  // Risk reward
  const risk = stock.lp - support;
  const reward = resistance - stock.lp;
  const rr = risk > 0 ? (reward / risk).toFixed(1) : "—";

  return {
    symbol: stock.s,
    name: stock.n || symbol,
    date: mero.turnover.date || "",
    price: {
      ltp: stock.lp, open: stock.op, high: stock.h, low: stock.l,
      change: stock.lp * stock.pc / 100, changePct: chgPct,
      rangePosition: Math.round(rangePos * 100) / 100,
      volatility: Math.round(volatility * 10000) / 10000,
      avgTradeSize: Math.round(avgTradeSize),
    },
    trend: {
      shortTerm, momentum: Math.round(finalTrendScore),
      strength: Math.round(trendStrength),
      consecutiveUp: chgPct > 0 ? 1 : 0, consecutiveDown: chgPct < 0 ? 1 : 0,
    },
    volume: {
      total: stock.q, turnover: stock.t,
      relativeToAvg: Math.round(volRatio * 10) / 10,
      quality: volumeQuality, surge: volRatio > 2,
    },
    signal: {
      direction: sig?.signal || null,
      confidence: sig?.confidence || 0,
      reason: sig?.reason || "No signal data",
      technical: tactical,
    },
    brokerFlow,
    supportResistance: {
      support: Math.round(support * 100) / 100,
      resistance: Math.round(resistance * 100) / 100,
      pivot: Math.round(pivot * 100) / 100,
      nearSupport, nearResistance,
    },
    verdict: {
      rating, score,
      summary: summaryParts.length > 0 ? summaryParts.join(" · ") : "No clear directional bias",
      action,
      riskReward: `1:${rr}`,
    },
  };
}
