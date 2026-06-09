"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
};

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
