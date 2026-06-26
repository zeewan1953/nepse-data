export type CircuitBreakerState = {
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
};

const breakers = new Map<string, CircuitBreakerState>();
const MAX_FAILURES = 3;
const COOLDOWN_MS = 60_000;

export async function circuitFetch(
  key: string,
  url: string,
  fallback: () => Promise<Response>,
  opts?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  let state = breakers.get(key);
  if (!state) {
    state = { failures: 0, lastFailure: 0, cooldownUntil: 0 };
    breakers.set(key, state);
  }

  if (state.failures >= MAX_FAILURES && now < state.cooldownUntil) {
    return fallback();
  }

  if (state.cooldownUntil > 0 && now >= state.cooldownUntil) {
    state.failures = 0;
    state.cooldownUntil = 0;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.failures = 0;
    return res;
  } catch (err) {
    state.failures++;
    state.lastFailure = now;
    if (state.failures >= MAX_FAILURES) {
      state.cooldownUntil = now + COOLDOWN_MS;
    }
    return fallback();
  }
}

export function resetBreaker(key: string): void {
  breakers.delete(key);
}

export function getBreakerState(key: string): CircuitBreakerState | null {
  return breakers.get(key) ?? null;
}

export async function fetchWithRetry(
  url: string,
  opts?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
      if (res.ok || attempt === maxRetries) return res;
    } catch {
      if (attempt === maxRetries) throw new Error(`Failed after ${maxRetries} retries`);
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}
