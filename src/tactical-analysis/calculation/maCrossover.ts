// Moving-average crossover detector (e.g. 20/50). Reports current alignment and
// whether a golden cross (fast crossing above slow) or death cross just formed.
import { smaSeries } from "./movingAverage";

export type Crossover = {
  fast: number;
  slow: number;
  state: "above" | "below";
  cross: "golden" | "death" | "none";
};

export function maCrossover(
  closes: number[],
  fastPeriod = 20,
  slowPeriod = 50,
): Crossover | null {
  const fastSeries = smaSeries(closes, fastPeriod);
  const slowSeries = smaSeries(closes, slowPeriod);
  if (fastSeries.length < 2 || slowSeries.length < 2) return null;

  // align tails (slow series is shorter)
  const n = Math.min(fastSeries.length, slowSeries.length);
  const f = fastSeries.slice(-n);
  const s = slowSeries.slice(-n);

  const fNow = f[n - 1];
  const sNow = s[n - 1];
  const fPrev = f[n - 2];
  const sPrev = s[n - 2];

  let cross: Crossover["cross"] = "none";
  if (fPrev <= sPrev && fNow > sNow) cross = "golden";
  else if (fPrev >= sPrev && fNow < sNow) cross = "death";

  return {
    fast: fNow,
    slow: sNow,
    state: fNow >= sNow ? "above" : "below",
    cross,
  };
}
