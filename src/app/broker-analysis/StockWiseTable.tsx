"use client";
import { useEffect, useMemo, useState, useCallback } from "react";

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
  stocks: Array<{ symbol: string; name: string; qty: number; amount: number; trades: number; avgPrice: number }>;
  stockBrokers: Record<string, BrokerRow[]>;
};

const fmt = (n: number) => n.toLocaleString("en-IN");
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return fmt(n);
};

const NEPAL_TZ = "Asia/Kathmandu";
function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: NEPAL_TZ }); }

const SATURDAY = 6, SUNDAY = 0;
function isTradingDay(d = new Date()) {
  const np = new Date(d.toLocaleString("en-US", { timeZone: NEPAL_TZ }));
  const day = np.getDay();
  return day !== SATURDAY && day !== SUNDAY;
}

type SortKey = "symbol" | "brokerCount" | "buyVol" | "sellVol" | "netVol" | "buyAmt" | "sellAmt" | "netAmt";

const TOP_N = 5;

export function StockWiseTable() {
  const [resp, setResp] = useState<FsStockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("netVol");
  const [sortDesc, setSortDesc] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/fs-stock?live=true");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: FsStockResp = await r.json();
      if ((d as any).error) throw new Error((d as any).error);
      setResp(d);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5s
  useEffect(() => {
    const id = setInterval(() => { fetchData(); }, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  const stockList = useMemo(() => {
    if (!resp) return [];
    return resp.stocks.map((s) => {
      const brokers = resp.stockBrokers[s.symbol] ?? [];
      const buyVol = brokers.reduce((a, b) => a + b.buyQty, 0);
      const sellVol = brokers.reduce((a, b) => a + b.sellQty, 0);
      const buyAmt = brokers.reduce((a, b) => a + b.buyAmt, 0);
      const sellAmt = brokers.reduce((a, b) => a + b.sellAmt, 0);
      const brokerIds = brokers
        .map((b) => b.id)
        .sort((a, b) => {
          const netA = brokers.find((x) => x.id === a)!.netQty;
          const netB = brokers.find((x) => x.id === b)!.netQty;
          return Math.abs(netB) - Math.abs(netA);
        });
      return { ...s, brokers, brokerIds, buyVol, sellVol, netVol: buyVol - sellVol, buyAmt, sellAmt, netAmt: buyAmt - sellAmt };
    });
  }, [resp]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = stockList;
    if (q) rows = rows.filter((s) => s.symbol.toLowerCase().includes(q));
    return [...rows].sort((a, b) => {
      const mul = sortDesc ? -1 : 1;
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * mul;
      if (sortKey === "brokerCount") return (a.brokers.length - b.brokers.length) * mul;
      if (sortKey === "buyVol") return (a.buyVol - b.buyVol) * mul;
      if (sortKey === "sellVol") return (a.sellVol - b.sellVol) * mul;
      if (sortKey === "netVol") return (a.netVol - b.netVol) * mul;
      if (sortKey === "buyAmt") return (a.buyAmt - b.buyAmt) * mul;
      if (sortKey === "sellAmt") return (a.sellAmt - b.sellAmt) * mul;
      if (sortKey === "netAmt") return (a.netAmt - b.netAmt) * mul;
      return 0;
    });
  }, [stockList, sortKey, sortDesc, query]);

  const top5 = useMemo(() => {
    return [...stockList].sort((a, b) => (b.buyVol + b.sellVol) - (a.buyVol + a.sellVol)).slice(0, TOP_N);
  }, [stockList]);

  const maxVol = useMemo(() => Math.max(...top5.map((s) => s.buyVol + s.sellVol), 1), [top5]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else { setSortKey(k); setSortDesc(true); }
  };

  const sortArrow = (k: SortKey) => sortKey === k ? (sortDesc ? " ▼" : " ▲") : "";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-5 w-60 animate-pulse rounded bg-surface-2" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
                {["Symbol","Brk","Buy Qty","Sell Qty","Net Qty","Buy Amt","Sell Amt","Net Amt"].map((h) => (
                  <th key={h} className="px-2 py-2 text-right last:text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className={`px-2 py-2 ${j === 0 ? "text-left" : "text-right"}`}>
                      <div className={`inline-block h-3 animate-pulse rounded bg-surface-2 ${j === 0 ? "w-14" : j === 1 ? "w-8" : "w-14"}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-center text-[10px] text-muted animate-pulse">Fetching live NEPSE floorsheet...</p>
      </div>
    );
  }

  if (error || !resp) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
        {error ? `Error: ${error}` : "No data available."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top 5 bar chart */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Top {TOP_N} by Volume</div>
        <div className="space-y-1.5">
          {top5.map((s) => {
            const total = s.buyVol + s.sellVol;
            const buyPct = total > 0 ? (s.buyVol / total) * 100 : 0;
            return (
              <div key={s.symbol}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-foreground">{s.symbol}</span>
                  <span className="tabular-nums text-muted">
                    <span className="text-up">{fmt(s.buyVol)}</span> / <span className="text-down">{fmt(s.sellVol)}</span> · {s.brokers.length} brk
                  </span>
                </div>
                <div className="mt-0.5 flex h-2 w-full overflow-hidden rounded bg-surface-2">
                  <div className="h-full bg-up/60 transition-all" style={{ width: `${buyPct}%` }} />
                  <div className="h-full bg-down/60 transition-all" style={{ width: `${100 - buyPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">{sorted.length} stocks · {resp.date}{isTradingDay() ? " · live" : ""}</p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Symbol..."
          className="h-7 w-32 rounded border border-border bg-background px-2 text-[10px] outline-none focus:border-primary"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
              <th className="sticky left-0 bg-surface px-2 py-1.5 text-left cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("symbol")}>Symbol{sortArrow("symbol")}</th>
              <th className="px-2 py-1.5 text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("brokerCount")}>Brk{sortArrow("brokerCount")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("buyVol")}>Buy Qty{sortArrow("buyVol")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("sellVol")}>Sell Qty{sortArrow("sellVol")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("netVol")}>Net Qty{sortArrow("netVol")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("buyAmt")}>Buy Amt{sortArrow("buyAmt")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("sellAmt")}>Sell Amt{sortArrow("sellAmt")}</th>
              <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("netAmt")}>Net Amt{sortArrow("netAmt")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.symbol} className="border-b border-border/40 text-xs hover:bg-surface-2/40 transition-colors">
                <td className="sticky left-0 bg-surface px-2 py-1 font-bold text-foreground whitespace-nowrap">{s.symbol}</td>
                <td className="px-2 py-1 text-center" title={s.brokerIds.join(", ")}>
                  <span className="font-semibold text-foreground">{s.brokers.length}</span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-up whitespace-nowrap">{fmt(s.buyVol)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-down whitespace-nowrap">{fmt(s.sellVol)}</td>
                <td className={`px-2 py-1 text-right tabular-nums font-semibold whitespace-nowrap ${s.netVol >= 0 ? "text-up" : "text-down"}`}>
                  {s.netVol >= 0 ? "+" : ""}{fmt(s.netVol)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-up whitespace-nowrap">{compact(s.buyAmt)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-down whitespace-nowrap">{compact(s.sellAmt)}</td>
                <td className={`px-2 py-1 text-right tabular-nums font-semibold whitespace-nowrap ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>
                  {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && query && (
        <div className="py-8 text-center text-xs text-muted">No stocks matching &quot;{query}&quot;</div>
      )}
    </div>
  );
}
