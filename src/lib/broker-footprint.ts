// Section 9.2: computeBrokerFootprint
export function computeBrokerFootprint(dailyNetSeries: { date: string; netQty: number }[]) {
  const cumulativeNet = dailyNetSeries.reduce((sum, d) => sum + d.netQty, 0);

  let streakLength = 0;
  let streakDirection: number | null = null;
  for (let i = dailyNetSeries.length - 1; i >= 0; i--) {
    const sign = Math.sign(dailyNetSeries[i].netQty);
    if (sign === 0) break;
    if (streakDirection === null) streakDirection = sign;
    if (sign !== streakDirection) break;
    streakLength++;
  }

  let flips = 0;
  for (let i = 1; i < dailyNetSeries.length; i++) {
    const prevSign = Math.sign(dailyNetSeries[i - 1].netQty);
    const curSign = Math.sign(dailyNetSeries[i].netQty);
    if (prevSign !== 0 && curSign !== 0 && prevSign !== curSign) flips++;
  }

  let pattern: string;
  if (dailyNetSeries.length < 5) {
    pattern = "insufficient_history";
  } else if (streakLength >= dailyNetSeries.length - 1) {
    pattern = streakDirection && streakDirection > 0 ? "consistent_buyer" : "consistent_seller";
  } else if (flips >= dailyNetSeries.length - 3) {
    pattern = "rotating";
  } else {
    pattern = "mixed";
  }

  return { cumulativeNet, streakLength, streakDirection, flips, pattern, windowDays: dailyNetSeries.length };
}

// Section 10: getBestFlowSummary
export function getBestFlowSummary(
  brokerFootprints: Array<{ brokerCode: string; cumulativeNet: number; streakLength: number; streakDirection: number | null; flips: number; pattern: string }>
) {
  const topAccumulator = brokerFootprints.filter((b) => b.cumulativeNet > 0).sort((a, b) => b.cumulativeNet - a.cumulativeNet)[0] ?? null;
  const topDistributor = brokerFootprints.filter((b) => b.cumulativeNet < 0).sort((a, b) => a.cumulativeNet - b.cumulativeNet)[0] ?? null;
  const mostErratic = brokerFootprints.slice().sort((a, b) => b.flips - a.flips)[0] ?? null;
  return { topAccumulator, topDistributor, mostErratic };
}

// Pattern display helpers
export function patternLabel(pattern: string): string {
  const labels: Record<string, string> = {
    consistent_buyer: "Consistent Buyer",
    consistent_seller: "Consistent Seller",
    rotating: "Rotating",
    mixed: "Mixed",
    insufficient_history: "Insufficient History",
  };
  return labels[pattern] ?? pattern;
}

export function patternColor(pattern: string): string {
  const colors: Record<string, string> = {
    consistent_buyer: "var(--ba-green)",
    consistent_seller: "var(--ba-red)",
    rotating: "var(--ba-gold)",
    mixed: "var(--ba-blue)",
    insufficient_history: "var(--ba-text-dim)",
  };
  return colors[pattern] ?? "var(--ba-text-muted)";
}
