export type MeroStockDetail = {
  s: string;
  n: string;
  lp: number;
  t: number;
  pc: number;
  h: number;
  l: number;
  op: number;
  q: number;
};

export type TacticalFactors = {
  momentumScore: number;
  rangePosition: number;
  volatility: number;
  volumeRatio: number;
  intradayStrength: number;
};

export type TacticalSignal = {
  signal: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  factors: TacticalFactors;
  reason: string;
};

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeTacticalSignal(stock: MeroStockDetail, allVolumes: number[]): TacticalSignal {
  const range = stock.h - stock.l;
  const rangePosition = range > 0 ? clamp((stock.lp - stock.l) / range, 0, 1) : 0.5;
  const volatility = stock.op > 0 ? range / stock.op : 0;
  const medVol = median(allVolumes.filter((q) => q > 0)) || 1;
  const volumeRatio = stock.q / medVol;

  let strengthScore = 0;
  let factors = 0;

  // 1. Price momentum (normalized % change)
  if (stock.pc !== 0) {
    strengthScore += clamp((stock.pc / 10) * 35, -35, 35);
    factors++;
  }

  // 2. Range position: LTP near high → bullish, near low → bearish
  strengthScore += (rangePosition - 0.5) * 2 * 25;
  factors++;

  // 3. Volume confirmation: high volume in direction of move
  if (volumeRatio > 1.3) {
    const dir = stock.pc >= 0 ? 1 : -1;
    strengthScore += dir * clamp((volumeRatio - 1) * 12, 0, 25);
    factors++;
  }

  // 4. Volatility + range position combo
  if (volatility > 0.03 && rangePosition > 0.6) {
    strengthScore += 10;
    factors++;
  } else if (volatility > 0.03 && rangePosition < 0.4) {
    strengthScore -= 10;
    factors++;
  }

  const finalScore = factors > 0 ? strengthScore / factors : 0;
  const confidence = clamp(Math.abs(finalScore) + (volumeRatio > 2 ? 8 : 0) + (volatility > 0.04 ? 5 : 0), 0, 100);

  let signal: "BUY" | "SELL" | "NEUTRAL";
  if (finalScore > 18) signal = "BUY";
  else if (finalScore < -18) signal = "SELL";
  else signal = "NEUTRAL";

  const parts: string[] = [];
  if (stock.pc > 2.5) parts.push(`Strong momentum +${stock.pc.toFixed(1)}%`);
  else if (stock.pc > 1) parts.push(`Up ${stock.pc.toFixed(1)}%`);
  else if (stock.pc < -2.5) parts.push(`Sharp decline ${stock.pc.toFixed(1)}%`);
  else if (stock.pc < -1) parts.push(`Down ${stock.pc.toFixed(1)}%`);

  if (rangePosition > 0.75) parts.push("Near day high");
  else if (rangePosition < 0.25) parts.push("Near day low");
  else if (rangePosition > 0.65) parts.push("Above midpoint");

  if (volumeRatio > 3) parts.push(`${volumeRatio.toFixed(1)}x avg volume (surge)`);
  else if (volumeRatio > 1.8) parts.push(`${volumeRatio.toFixed(1)}x avg volume`);

  if (volatility > 0.05) parts.push("High volatility day");
  else if (volatility > 0.03) parts.push("Elevated volatility");

  return {
    signal,
    confidence: Math.round(confidence),
    factors: {
      momentumScore: Math.round(stock.pc * 10) / 10,
      rangePosition: Math.round(rangePosition * 100) / 100,
      volatility: Math.round(volatility * 10000) / 10000,
      volumeRatio: Math.round(volumeRatio * 10) / 10,
      intradayStrength: Math.round(finalScore),
    },
    reason: parts.length > 0 ? parts.join(" · ") : "No clear tactical signal",
  };
}
