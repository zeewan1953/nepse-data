// Classic floor-trader pivot points from the previous period's High/Low/Close.

export type Pivots = {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
};

export function pivotPoints(high: number, low: number, close: number): Pivots {
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);
  return { pivot, r1, r2, r3, s1, s2, s3 };
}
