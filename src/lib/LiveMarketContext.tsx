"use client";
import {
  createContext,
  useContext,
  useMemo,
} from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus } from "@/lib/types";

type LiveResp = { data: LiveMarketData[]; count: number };

type LiveMarketCtx = {
  /** Full live market data array (single source of truth) */
  data: LiveResp | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  /** Symbol → full LiveMarketData row */
  bySymbol: Map<string, LiveMarketData>;
  /** Symbol → lastTradedPrice (convenience) */
  ltpMap: Map<string, number>;
  /** All symbols sorted alphabetically (for search/datalists) */
  allSymbols: string[];
};

const Ctx = createContext<LiveMarketCtx>({
  data: null,
  error: null,
  loading: true,
  updatedAt: null,
  bySymbol: new Map(),
  ltpMap: new Map(),
  allSymbols: [],
});

export function LiveMarketProvider({ children }: { children: React.ReactNode }) {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = open ? 2_000 : 30_000;

  const live = usePoll<LiveResp>("/api/live", interval);

  const bySymbol = useMemo(() => {
    const m = new Map<string, LiveMarketData>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r);
    return m;
  }, [live.data]);

  const ltpMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r.lastTradedPrice);
    return m;
  }, [live.data]);

  const allSymbols = useMemo(
    () => (live.data?.data ?? []).map((r) => r.symbol).sort(),
    [live.data],
  );

  return (
    <Ctx.Provider
      value={{
        data: live.data,
        error: live.error,
        loading: live.loading,
        updatedAt: live.updatedAt,
        bySymbol,
        ltpMap,
        allSymbols,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Use inside any client component to access the shared live market data. */
export function useLiveMarket() {
  return useContext(Ctx);
}
