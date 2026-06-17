import type { StockFundamental } from "./fundamentalData";

export function cagr(values: number[]): number {
  if (values.length < 2) return 0;
  const start = values[0];
  const end = values[values.length - 1];
  if (start <= 0 || end <= 0) return 0;
  const years = values.length - 1;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function healthScore(stock: StockFundamental): number {
  const r = stock.ratios;
  // Debt/equity lower is better, current ratio higher, profit margin proxy from ROE, ROE higher
  const debtScore = Math.max(0, Math.min(100, (1 - r.debtEquity / 1.5) * 100));
  const currentScore = Math.max(0, Math.min(100, (r.currentRatio / 2.5) * 100));
  const marginScore = Math.max(0, Math.min(100, (stock.current.roe / 30) * 100));
  const roeScore = Math.max(0, Math.min(100, (stock.current.roe / 30) * 100));
  return Math.round(debtScore * 0.3 + currentScore * 0.2 + marginScore * 0.2 + roeScore * 0.3);
}

export function growthScore(stock: StockFundamental): number {
  const fy = stock.threeYear;
  const revCagr = cagr(fy.revenue);
  const profitCagr = cagr(fy.profit);
  const epsCagr = cagr(fy.eps);
  const divCagr = cagr(fy.dividend);
  const revScore = Math.max(0, Math.min(100, (revCagr / 30) * 100));
  const profitScore = Math.max(0, Math.min(100, (profitCagr / 35) * 100));
  const epsScore = Math.max(0, Math.min(100, (epsCagr / 35) * 100));
  const divScore = Math.max(0, Math.min(100, (divCagr / 40) * 100));
  return Math.round(revScore * 0.3 + profitScore * 0.3 + epsScore * 0.2 + divScore * 0.2);
}

export function verdict(stock: StockFundamental): { label: "BUY" | "HOLD" | "SELL"; reason: string; icon: string } {
  const h = healthScore(stock);
  const g = growthScore(stock);
  if (h >= 70 && g >= 70) {
    return { label: "BUY", icon: "📈", reason: "Consistent 3-year growth with improving fundamentals and manageable debt." };
  }
  if ((h >= 50 && g >= 50) || (h >= 70 && g < 50)) {
    return { label: "HOLD", icon: "➡️", reason: "Moderate fundamentals; hold for better earnings clarity or entry point." };
  }
  return { label: "SELL", icon: "📉", reason: "Weak fundamentals, high debt or declining growth trend observed." };
}

export function stars(score: number): string {
  const count = Math.round(score / 20);
  return "★".repeat(count) + "☆".repeat(5 - count);
}

export function enriched(stock: StockFundamental) {
  const fy = stock.threeYear;
  const h = healthScore(stock);
  const g = growthScore(stock);
  const v = verdict(stock);
  return {
    ...stock,
    revenueCAGR: cagr(fy.revenue),
    profitCAGR: cagr(fy.profit),
    epsCAGR: cagr(fy.eps),
    avgROE: avg(fy.roe),
    debtChange: ((fy.debt[fy.debt.length - 1] - fy.debt[0]) / fy.debt[0]) * 100,
    dividendGrowth: ((fy.dividend[fy.dividend.length - 1] - fy.dividend[0]) / fy.dividend[0]) * 100,
    healthScore: h,
    growthScore: g,
    verdict: v,
  };
}

export type EnrichedStock = ReturnType<typeof enriched>;
