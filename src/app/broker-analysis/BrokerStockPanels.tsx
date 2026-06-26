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
};
type FsStockResp = {
  date: string;
  stocks: Array<{ symbol: string }>;
  stockBrokers: Record<string, BrokerRow[]>;
};

type StockPick = { symbol: string; qty: number; amt: number };
type BrokerPanel = {
  id: string;
  topBuys: StockPick[];
  topSells: StockPick[];
  totalBuyQty: number;
  totalSellQty: number;
};

const fmt = (n: number) => n.toLocaleString("en-IN");

export function BrokerStockPanels({ onlyBrokers }: { onlyBrokers?: string[] } = {}) {
  const [resp, setResp] = useState<FsStockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/fs-stock")
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

  // Invert stockBrokers (stock -> brokers) into broker -> stocks, then pick top 5.
  const panels = useMemo<BrokerPanel[]>(() => {
    if (!resp) return [];
    const allow = onlyBrokers && onlyBrokers.length ? new Set(onlyBrokers.map(String)) : null;
    // brokerId -> { symbol -> {buyQty, sellQty, buyAmt, sellAmt} }
    const byBroker = new Map<string, Map<string, { buyQty: number; sellQty: number; buyAmt: number; sellAmt: number }>>();

    for (const [symbol, brokers] of Object.entries(resp.stockBrokers)) {
      for (const b of brokers) {
        if (allow && !allow.has(String(b.id))) continue;
        if (!byBroker.has(b.id)) byBroker.set(b.id, new Map());
        const m = byBroker.get(b.id)!;
        const prev = m.get(symbol) ?? { buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
        prev.buyQty += b.buyQty;
        prev.sellQty += b.sellQty;
        prev.buyAmt += b.buyAmt;
        prev.sellAmt += b.sellAmt;
        m.set(symbol, prev);
      }
    }

    const result: BrokerPanel[] = [];
    for (const [id, stockMap] of byBroker) {
      const entries = [...stockMap.entries()];
      const topBuys = entries
        .filter(([, v]) => v.buyQty > 0)
        .map(([symbol, v]) => ({ symbol, qty: v.buyQty, amt: v.buyAmt }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const topSells = entries
        .filter(([, v]) => v.sellQty > 0)
        .map(([symbol, v]) => ({ symbol, qty: v.sellQty, amt: v.sellAmt }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const totalBuyQty = entries.reduce((a, [, v]) => a + v.buyQty, 0);
      const totalSellQty = entries.reduce((a, [, v]) => a + v.sellQty, 0);
      result.push({ id, topBuys, topSells, totalBuyQty, totalSellQty });
    }

    // Most active brokers first (by total volume)
    return result.sort((a, b) => (b.totalBuyQty + b.totalSellQty) - (a.totalBuyQty + a.totalSellQty));
  }, [resp, onlyBrokers]);

  const filteredPanels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return panels;
    return panels.filter((p) => p.id.toLowerCase().includes(q));
  }, [panels, search]);

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

  // Favorites mode with nothing starred yet
  if (onlyBrokers && onlyBrokers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <div className="mb-2 text-3xl">⭐</div>
        <div className="text-sm text-muted">No favorite brokers yet.</div>
        <div className="mt-1 text-xs text-muted">Star brokers in the Broker Wise tab to see their top buy/sell stocks here.</div>
      </div>
    );
  }

  // Favorites starred but none of them traded on this floorsheet date
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
          {panels.length} brokers · {resp.date} · top 5 buy &amp; sell stocks by kitta per broker
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter broker (e.g. 42)"
          className="h-8 w-40 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPanels.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Broker {p.id}</span>
              <span className="text-[9px] text-muted tabular-nums">
                B {fmt(p.totalBuyQty)} · S {fmt(p.totalSellQty)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Buy side */}
              <div>
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-up">Buy side</div>
                {p.topBuys.length === 0 ? (
                  <div className="text-[10px] text-muted">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {p.topBuys.map((s) => (
                      <li key={s.symbol} className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">{s.symbol}</span>
                        <span className="tabular-nums text-up">{fmt(s.qty)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Sell side */}
              <div>
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-down">Sell side</div>
                {p.topSells.length === 0 ? (
                  <div className="text-[10px] text-muted">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {p.topSells.map((s) => (
                      <li key={s.symbol} className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">{s.symbol}</span>
                        <span className="tabular-nums text-down">{fmt(s.qty)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredPanels.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 text-center text-xs text-muted">
          No broker matches &quot;{search}&quot;
        </div>
      )}
    </div>
  );
}
