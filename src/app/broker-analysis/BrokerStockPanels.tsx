"use client";
import { useEffect, useMemo, useState } from "react";

type BrokerRow = {
  id: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
  action: string;
};
type FsStockResp = {
  date: string;
  stocks: Array<{ symbol: string }>;
  stockBrokers: Record<string, BrokerRow[]>;
};

type StockPick = { symbol: string; qty: number; amt: number; aggressive: boolean };
type BrokerPanel = {
  id: string;
  topBuys: StockPick[];
  topSells: StockPick[];
  totalBuyQty: number;
  totalSellQty: number;
};

const MIN_KITTA = 2000;
const fmt = (n: number) => n.toLocaleString("en-IN");

export function BrokerStockPanels({ onlyBrokers }: { onlyBrokers?: string[] } = {}) {
  const [resp, setResp] = useState<FsStockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/fs-stock?live=true")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: FsStockResp) => {
        if ((d as any).error) throw new Error((d as any).error);
        setResp(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load");
        setLoading(false);
      });
  }, []);

  const panels = useMemo<BrokerPanel[]>(() => {
    if (!resp) return [];
    const allow = onlyBrokers && onlyBrokers.length ? new Set(onlyBrokers.map(String)) : null;
    const byBroker = new Map<string, Map<string, { buyQty: number; sellQty: number; buyAmt: number; sellAmt: number; aggressiveBuy: boolean; aggressiveSell: boolean }>>();

    for (const [symbol, brokers] of Object.entries(resp.stockBrokers)) {
      for (const b of brokers) {
        if (allow && !allow.has(String(b.id))) continue;
        if (!byBroker.has(b.id)) byBroker.set(b.id, new Map());
        const m = byBroker.get(b.id)!;
        const prev = m.get(symbol) ?? { buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, aggressiveBuy: false, aggressiveSell: false };
        prev.buyQty += b.buyQty;
        prev.sellQty += b.sellQty;
        prev.buyAmt += b.buyAmt;
        prev.sellAmt += b.sellAmt;
        prev.aggressiveBuy = prev.aggressiveBuy || (b.buyQty > 0 && b.sellQty === 0);
        prev.aggressiveSell = prev.aggressiveSell || (b.sellQty > 0 && b.buyQty === 0);
        m.set(symbol, prev);
      }
    }

    const result: BrokerPanel[] = [];
    for (const [id, stockMap] of byBroker) {
      const entries = [...stockMap.entries()];
      const topBuys = entries
        .filter(([, v]) => v.buyQty >= MIN_KITTA)
        .map(([symbol, v]) => ({ symbol, qty: v.buyQty, amt: v.buyAmt, aggressive: v.aggressiveBuy && v.sellQty === 0 }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const topSells = entries
        .filter(([, v]) => v.sellQty >= MIN_KITTA)
        .map(([symbol, v]) => ({ symbol, qty: v.sellQty, amt: v.sellAmt, aggressive: v.aggressiveSell && v.buyQty === 0 }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const totalBuyQty = entries.reduce((a, [, v]) => a + v.buyQty, 0);
      const totalSellQty = entries.reduce((a, [, v]) => a + v.sellQty, 0);
      result.push({ id, topBuys, topSells, totalBuyQty, totalSellQty });
    }

    return result.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
  }, [resp, onlyBrokers]);

  const leftPanels = panels;
  const rightPanels = panels;

  const filteredLeft = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leftPanels;
    return leftPanels.filter((p) => p.id.toLowerCase().includes(q));
  }, [leftPanels, search]);

  const filteredRight = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rightPanels;
    return rightPanels.filter((p) => p.id.toLowerCase().includes(q));
  }, [rightPanels, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-sm text-muted">Loading broker stock picks...</span>
      </div>
    );
  }

  if (error || !resp) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
        {error ? `Error: ${error}` : "No floorsheet data available."}
      </div>
    );
  }

  if (onlyBrokers && onlyBrokers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <div className="mb-2 text-3xl">⭐</div>
        <div className="text-sm text-muted">No favorite brokers yet.</div>
        <div className="mt-1 text-xs text-muted">Star brokers in the Broker Wise tab to see their top buy/sell stocks here.</div>
      </div>
    );
  }

  if (onlyBrokers && onlyBrokers.length > 0 && panels.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-10 text-center text-sm text-muted">
        No floorsheet activity for your {onlyBrokers.length} favorite broker(s) on {resp.date}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {panels.length} brokers · {resp.date} · kitta &ge; {MIN_KITTA.toLocaleString("en-IN")} · ⚡=aggressive
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter broker (e.g. 42)"
          className="h-8 w-40 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Top Buyers */}
        <div className="flex-1">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-up">Top Buyers</div>
          <div className="space-y-2">
            {filteredLeft.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Broker {p.id}</span>
                  <span className="text-[9px] text-muted">B {fmt(p.totalBuyQty)}</span>
                </div>
                {p.topBuys.length === 0 ? (
                  <div className="text-[10px] text-muted">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {p.topBuys.map((s) => (
                      <li key={s.symbol} className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">{s.aggressive ? "⚡ " : ""}{s.symbol}</span>
                        <span className="tabular-nums text-up">{fmt(s.qty)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Top Sellers */}
        <div className="flex-1">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-down">Top Sellers</div>
          <div className="space-y-2">
            {filteredRight.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Broker {p.id}</span>
                  <span className="text-[9px] text-muted">S {fmt(p.totalSellQty)}</span>
                </div>
                {p.topSells.length === 0 ? (
                  <div className="text-[10px] text-muted">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {p.topSells.map((s) => (
                      <li key={s.symbol} className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">{s.aggressive ? "⚡ " : ""}{s.symbol}</span>
                        <span className="tabular-nums text-down">{fmt(s.qty)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {search && filteredLeft.length === 0 && filteredRight.length === 0 && (
        <div className="py-8 text-center text-xs text-muted">No broker matches &quot;{search}&quot;</div>
      )}
    </div>
  );
}
