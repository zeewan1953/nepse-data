// Fibonacci retracement & extension levels between a swing high and swing low.

export type FibLevels = {
  high: number;
  low: number;
  // retracements (from the move), useful as support in an uptrend
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  // extensions (targets beyond the high)
  ext1272: number;
  ext1618: number;
};

export function fibonacci(high: number, low: number): FibLevels {
  const diff = high - low;
  return {
    high,
    low,
    level236: high - diff * 0.236,
    level382: high - diff * 0.382,
    level500: high - diff * 0.5,
    level618: high - diff * 0.618,
    level786: high - diff * 0.786,
    ext1272: high + diff * 0.272,
    ext1618: high + diff * 0.618,
  };
}

// Find the nearest fib retracement level below the given price (acts as support).
export function nearestFibSupport(levels: FibLevels, price: number): number | null {
  const candidates = [
    levels.level236,
    levels.level382,
    levels.level500,
    levels.level618,
    levels.level786,
    levels.low,
  ].filter((l) => l < price);
  return candidates.length ? Math.max(...candidates) : null;
}
