import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveStock = {
  symbol: string;
  percentageChange: number;
  totalTradeValue: number;
  totalTradeQuantity: number;
};

type Summary = {
  generatedAt: number;
  nepseIndex: number;
  change: number;
  changePct: number;
  marketStatus: "consolidation" | "uptrend" | "downtrend" | "volatile";
  support: { s1: number; s2: number; s3: number };
  resistance: { r1: number; r2: number; r3: number };
  pivot: number;
  confidence: number;
  points: string[];
  accumulation: string[];
  distribution: string[];
  recommendation: string;
  brokerActivity: "active" | "inactive" | "mixed";
  sentiment: string;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalVolume: number;
  totalValue: number;
};

async function fetchLive(): Promise<LiveStock[]> {
  try {
    // Try Vercel production URL first, then localhost for dev
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    
    const res = await fetch(`${baseUrl}/api/live`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data || [];
  } catch {
    return [];
  }
}

function analyze(stocks: LiveStock[]): Summary {
  if (!stocks.length) {
    return {
      generatedAt: Date.now(),
      nepseIndex: 0, change: 0, changePct: 0,
      marketStatus: "consolidation",
      support: { s1: 0, s2: 0, s3: 0 },
      resistance: { r1: 0, r2: 0, r3: 0 },
      pivot: 0,
      confidence: 0,
      points: ["डेटा उपलब्ध छैन"],
      accumulation: [], distribution: [],
      recommendation: "HOLD",
      brokerActivity: "inactive",
      sentiment: "डेटा पर्खनुहोस्",
      upCount: 0, downCount: 0, flatCount: 0,
      totalVolume: 0, totalValue: 0,
    };
  }

  const up = stocks.filter((s) => s.percentageChange > 0);
  const down = stocks.filter((s) => s.percentageChange < 0);
  const avgChange = stocks.reduce((s, x) => s + x.percentageChange, 0) / stocks.length;
  const totalValue = stocks.reduce((s, x) => s + x.totalTradeValue, 0);

  const baseIndex = 2700;
  const nepseIndex = Math.round(baseIndex * (1 + avgChange / 100));
  const change = Math.round((nepseIndex - baseIndex) * 100) / 100;

  const upRatio = up.length / stocks.length;
  const downRatio = down.length / stocks.length;
  const volatility = Math.abs(avgChange);

  let marketStatus: Summary["marketStatus"] = "consolidation";
  if (upRatio > 0.6 && volatility > 1) marketStatus = "uptrend";
  else if (downRatio > 0.6 && volatility > 1) marketStatus = "downtrend";
  else if (volatility > 2) marketStatus = "volatile";

  // Calculate Pivot Points (Fibonacci style)
  // Using average high/low/close approximation from live data
  const highApprox = nepseIndex * (1 + Math.abs(avgChange) / 50);
  const lowApprox = nepseIndex * (1 - Math.abs(avgChange) / 50);
  const closeApprox = nepseIndex;
  
  const pivot = Math.round((highApprox + lowApprox + closeApprox) / 3);
  const support = {
    s1: Math.round(pivot * 2 - highApprox),
    s2: Math.round(pivot - (highApprox - lowApprox) * 0.618),
    s3: Math.round(lowApprox - (highApprox - pivot) * 0.618),
  };
  const resistance = {
    r1: Math.round(pivot * 2 - lowApprox),
    r2: Math.round(pivot + (highApprox - lowApprox) * 0.618),
    r3: Math.round(highApprox + (pivot - lowApprox) * 0.618),
  };
  const confidence = Math.min(Math.round(50 + volatility * 5), 75);

  // Accumulation: high volume, small change
  const accumulation = stocks
    .filter((s) => s.totalTradeValue > (totalValue / stocks.length) * 2 && Math.abs(s.percentageChange) < 2)
    .sort((a, b) => b.totalTradeValue - a.totalTradeValue)
    .slice(0, 4)
    .map((s) => s.symbol);

  // Distribution: high volume, big drop
  const distribution = stocks
    .filter((s) => s.totalTradeValue > (totalValue / stocks.length) * 2 && s.percentageChange < -2)
    .sort((a, b) => b.totalTradeValue - a.totalTradeValue)
    .slice(0, 4)
    .map((s) => s.symbol);

  // Broker activity
  const top10 = stocks.sort((a, b) => b.totalTradeValue - a.totalTradeValue).slice(0, 10);
  const top10Share = top10.reduce((s, x) => s + x.totalTradeValue, 0) / totalValue;
  const brokerActivity: Summary["brokerActivity"] = top10Share > 0.5 ? "active" : top10Share < 0.3 ? "inactive" : "mixed";

  // Points in Nepali
  const points: string[] = [];
  if (marketStatus === "consolidation") points.push("बजार संकुचन (Consolidation) मा छ");
  else if (marketStatus === "uptrend") points.push("बजार माथिल्लो ट्रेंडमा छ");
  else if (marketStatus === "downtrend") points.push("बजार तल्लो ट्रेंडमा छ");
  else points.push("बजार अस्थिर छ");

  points.push(`सपोर्ट: ${support.s1}, ${support.s2} | रेसिस्टेन्स: ${resistance.r1}, ${resistance.r2}`);

  if (brokerActivity === "inactive") points.push("ठूला ब्रोकरहरू निष्क्रिय छन्");
  else if (brokerActivity === "active") points.push("ठूला ब्रोकरहरू सक्रिय छन्");
  else points.push("ब्रोकर गतिविधि मिश्रित छ");

  if (accumulation.length > 0) points.push(`${accumulation.join(", ")} मा Accumulation`);
  if (distribution.length > 0) points.push(`${distribution.join(", ")} मा Distribution`);

  if (volatility < 1) points.push("स्पष्ट दिशाको लागि २-३ दिन पर्खनुहोस्");

  // Recommendation
  let recommendation = "HOLD (पर्खने)";
  if (marketStatus === "uptrend" && upRatio > 0.6) recommendation = "BUY";
  else if (marketStatus === "downtrend" && downRatio > 0.6) recommendation = "SELL";

  // Sentiment
  let sentiment = "मिश्रित";
  if (upRatio > 0.6) sentiment = "सकारात्मक";
  else if (downRatio > 0.6) sentiment = "नकारात्मक";

  return {
    generatedAt: Date.now(),
    nepseIndex, change, changePct: Math.round(avgChange * 100) / 100,
    marketStatus, support, resistance, pivot, confidence,
    points, accumulation, distribution, recommendation, brokerActivity, sentiment,
    upCount: up.length, downCount: down.length, flatCount: stocks.length - up.length - down.length,
    totalVolume: stocks.reduce((s, x) => s + x.totalTradeQuantity, 0),
    totalValue: totalValue,
  };
}

export async function GET() {
  try {
    const stocks = await fetchLive();
    const summary = analyze(stocks);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("NEPSE Summary Error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
