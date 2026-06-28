import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { computeTacticalSignal, TacticalSignal, type MeroStockDetail } from "@/lib/tactical-signals";
import { fetchMeroLaganiNews, NewsItem } from "@/lib/news-analyzer";

export type SignalOutput = {
  symbol: string;
  name: string;
  sector?: string;
  signal: "BUY" | "SELL" | "NEUTRAL" | null;
  confidence: number;
  reason: string;
  cmf: number | null;
  mfi: number | null;
  volZ: number | null;
  smartMoneyScore: number | null;
  tactical: {
    momentumScore: number;
    rangePosition: number;
    volatility: number;
    volumeRatio: number;
    intradayStrength: number;
  } | null;
  newsSentiment: number;
  dataSource: string;
};

export function groupBySector(signals: SignalOutput[]): Map<string, SignalOutput[]> {
  const map = new Map<string, SignalOutput[]>();
  for (const s of signals) {
    const sector = s.sector || "Other";
    if (!map.has(sector)) map.set(sector, []);
    map.get(sector)!.push(s);
  }
  return map;
}

function calculateWeightedSignal(tactical: TacticalSignal | null, newsScore: number): { signal: SignalOutput["signal"]; confidence: number; reason: string } {
  let totalScore = 0;
  let maxPossible = 0;
  const parts: string[] = [];

  // Tactical (70% weight)
  if (tactical) {
    const w = 0.7;
    if (tactical.signal === "BUY") {
      totalScore += tactical.confidence * w;
      parts.push(`Tactical BUY (${tactical.confidence}% conf)`);
    } else if (tactical.signal === "SELL") {
      totalScore -= tactical.confidence * w;
      parts.push(`Tactical SELL (${tactical.confidence}% conf)`);
    }
    maxPossible += 100 * w;
    if (tactical.reason !== "No clear tactical signal") {
      parts.push(tactical.reason);
    }
  }

  // News (30% weight)
  const newsWeight = 0.3;
  if (newsScore > 0) {
    totalScore += Math.min(newsScore, 5) * 15 * newsWeight;
    parts.push(`Positive news (score: ${newsScore > 0 ? "+" : ""}${newsScore})`);
    maxPossible += 75 * newsWeight;
  } else if (newsScore < 0) {
    totalScore += Math.max(newsScore, -5) * 15 * newsWeight;
    parts.push(`Negative news (score: ${newsScore})`);
    maxPossible += 75 * newsWeight;
  }

  // Normalize
  const maxScore = maxPossible || 70;
  const normalized = (totalScore / maxScore) * 100;
  const confidence = Math.min(Math.abs(Math.round(normalized)), 100);

  let signal: SignalOutput["signal"];
  if (normalized > 15) signal = "BUY";
  else if (normalized < -15) signal = "SELL";
  else signal = "NEUTRAL";

  // If no real data at all
  if (!tactical && newsScore === 0) {
    signal = null;
    return { signal, confidence: 0, reason: "No real-time market data available" };
  }

  return {
    signal,
    confidence,
    reason: parts.length > 0 ? parts.join(" · ") : "Mixed/neutral signals",
  };
}

export async function buildSignalsFromLiveData(): Promise<{ signals: SignalOutput[]; source: string }> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail?.length) {
    return { signals: [], source: "unavailable" };
  }

  const allVolumes = mero.turnover.detail.map((s) => s.q);

  // Try fetching news
  let newsItems: NewsItem[] = [];
  try {
    newsItems = await fetchMeroLaganiNews();
  } catch {}

  const symbolNewsMap = new Map<string, number>();
  for (const n of newsItems) {
    if (n.symbol) {
      const existing = symbolNewsMap.get(n.symbol) ?? 0;
      const adj = n.sentiment === "positive" ? 1 : n.sentiment === "negative" ? -1 : 0;
      symbolNewsMap.set(n.symbol, existing + adj);
    }
  }

  const signals: SignalOutput[] = mero.turnover.detail.map((s: MeroStockDetail) => {
    const tactical = computeTacticalSignal(s, allVolumes);
    const newsScore = symbolNewsMap.get(s.s) ?? 0;
    const { signal, confidence, reason } = calculateWeightedSignal(tactical, newsScore);

    return {
      symbol: s.s,
      name: s.n || s.s,
      signal,
      confidence,
      reason,
      cmf: null,
      mfi: null,
      volZ: null,
      smartMoneyScore: null,
      tactical: tactical.factors,
      newsSentiment: newsScore,
      dataSource: "merolagani",
    };
  });

  // Sort: BUY highest conf first, then SELL, then NEUTRAL, then null
  signals.sort((a, b) => {
    const order = { BUY: 0, SELL: 1, NEUTRAL: 2, null: 3 } as const;
    const aOrd = order[a.signal ?? "null"];
    const bOrd = order[b.signal ?? "null"];
    if (aOrd !== bOrd) return aOrd - bOrd;
    return b.confidence - a.confidence;
  });

  return { signals, source: "live" };
}
