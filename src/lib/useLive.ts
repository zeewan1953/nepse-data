"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
};

// Re-export from shared market-hours utility
export { isNepseMarketOpen } from "@/lib/market-hours";
import { isNepseMarketOpen } from "@/lib/market-hours";

// Polls a JSON endpoint on an interval. Used for live market data — fast while
// the NEPSE market is open, slower when closed.
export function usePoll<T>(url: string, intervalMs: number): State<T> & { refresh: () => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    updatedAt: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!alive.current) return;
      if (!res.ok) {
        setState((s) => ({ ...s, error: json?.error ?? `HTTP ${res.status}`, loading: false }));
      } else {
        setState({ data: json as T, error: null, loading: false, updatedAt: Date.now() });
      }
    } catch (e) {
      if (alive.current)
        setState((s) => ({ ...s, error: (e as Error).message, loading: false }));
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      await load();
      if (alive.current) timer.current = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, intervalMs]);

  return { ...state, refresh: load };
}

// Persistent poll with market-hours awareness:
// - Uses localStorage so data NEVER disappears on refresh
// - During market hours (11AM-3PM NPT): polls every `marketIntervalMs`
// - Outside market hours: loads cached data once, no auto-polling
// - Manual refresh always works via returned `refresh`
export function usePersistentPoll<T>(
  url: string,
  marketIntervalMs: number,
): State<T> & { refresh: () => void; isMarketOpen: boolean } {
  const storageKey = `ppoll:${url}`;
  const FIVE_MIN = 5 * 60 * 1000;

  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    updatedAt: null,
  });
  const [marketOpen, setMarketOpen] = useState(() => isNepseMarketOpen());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage on client only — prevents hydration mismatch
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState({ data: parsed.data as T, error: null, loading: false, updatedAt: parsed.updatedAt as number });
      }
    } catch { /* ignore */ }
  }, [storageKey]);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!alive.current) return;
      if (!res.ok) {
        setState((s) => ({ ...s, error: json?.error ?? `HTTP ${res.status}`, loading: false }));
      } else {
        const newData = json as T;
        const now = Date.now();
        try { localStorage.setItem(storageKey, JSON.stringify({ data: newData, updatedAt: now })); } catch { /* quota */ }
        setState({ data: newData, error: null, loading: false, updatedAt: now });
      }
    } catch (e) {
      if (alive.current)
        setState((s) => ({ ...s, error: (e as Error).message, loading: false }));
    }
  }, [url, storageKey]);

  useEffect(() => {
    alive.current = true;

    // Check market status now and every 30s
    const checkMarket = () => setMarketOpen(isNepseMarketOpen());
    checkMarket();
    const marketCheckTimer = setInterval(checkMarket, 30_000);

    const tick = async () => {
      await load();
      // Only schedule next poll if market is currently open
      if (alive.current && isNepseMarketOpen()) {
        timer.current = setTimeout(tick, marketIntervalMs);
      } else {
        // Market closed: schedule a check in 5 min to see if market opened
        timer.current = setTimeout(tick, FIVE_MIN);
      }
    };

    // Initial load
    tick();

    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(marketCheckTimer);
    };
  }, [load, marketIntervalMs]);

  return { ...state, refresh: load, isMarketOpen: marketOpen };
}
