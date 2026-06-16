"use client";
import { useState, useEffect, useMemo } from "react";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, LiveMarketData } from "@/lib/types";
import { num, compact } from "@/lib/format";
import Link from "next/link";

type BrokerStock = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type BrokerResp = { broker: number; stocks: BrokerStock[]; totals: { buyAmt: number; sellAmt: number; netAmt: number }; error?: string };
type LiveResp = { data: LiveMarketData[]; count: number };

const BROKERS = Array.from({ length: 68 }, (_, i) => i + 1);

export default function BrokerAnalysisPage() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const { data: liveData } = usePoll<LiveResp>("/api/live", open ? 5_000 : 60_000);

  const [brokerId, setBrokerId] = useState(1);
  const [data, setData] = useState<BrokerResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(open);
  const [sortKey, setSortKey] = useState<"netAmt" | "buyAmt" | "sellAmt" | "netQty">("netAmt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [q, setQ] = useState("");

  // Fetch broker data
  useEffect(() => {
    setLoading(true);
    setError("");
    setData(null);
    fetch(`/api/broker/${brokerId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError("Failed to load broker data"))
      .finally(() => setLoading(false));
  }, [brokerId]);

  // Auto-refresh when market is open
  useEffect(() => {
    if (!autoRefresh || !open) return;
    const interval = setInterval(() => {
      fetch(`/api/broker/${brokerId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (!j.error) setData(j); })
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(interval);
  }, [brokerId, autoRefresh, open]);

  // Live price map
  const priceMap = useMemo(() => {
    const m = new Map<string, { ltp: number; change: number }>();
    for (const r of liveData?.data ?? []) m.set(r.symbol, { ltp: r.lastTradedPrice, change: r.percentageChange });
    return m;
  }, [liveData]);

  // Filtered and sorted stocks
  const sorted = useMemo(() => {
    if (!data?.stocks) return [];
    let list = [...data.stocks];
    if (q) list = list.filter((s) => s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
    list.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [data, sortKey, sortDir, q]);

  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;
  const topBuy = sorted[0];
  const topSell = [...sorted].sort((a, b) => a.netAmt - b.netAmt)[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker Analysis</h1>
          <p className="text-sm text-muted">
            {data ? `Broker #${brokerId} · ${data.stocks.length} stocks traded` : "Select a broker to view analysis"}
            {open ? " · LIVE" : " · market closed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {open && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded" />
              Auto-refresh
            </label>
          )}
          <select
            value={brokerId}
            onChange={(e) => setBrokerId(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold outline-none focus:border-primary"
          >
            {BROKERS.map((b) => (
              <option key={b} value={b}>Broker #{b}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data && <div className="rounded-xl bg-surface p-8 text-center text-muted border border-border">Loading broker #{brokerId}…</div>}
      {error && <div className="rounded-xl bg-down-bg p-4 text-sm text-down">{error}</div>}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Buy Amount" value={compact(data.totals.buyAmt)} color="text-up" />
            <StatCard label="Sell Amount" value={compact(data.totals.sellAmt)} color="text-down" />
            <StatCard label="Net Amount" value={compact(data.totals.netAmt)} color={data.totals.netAmt >= 0 ? "text-up" : "text-down"} />
            <StatCard label="Buy Ratio" value={`${buyRatio.toFixed(1)}%`} color={buyRatio > 50 ? "text-up" : "text-down"} />
          </div>

          {/* Top Movers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-3 text-lg font-bold text-foreground">Top Net Buy</h3>
              {topBuy && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-up-bg p-3">
                    <Link href={`/stock/${topBuy.symbol}`} className="font-bold text-primary hover:underline">
                      {topBuy.symbol.replace(/\d+/g, "")}
                    </Link>
                    <span className="text-sm font-bold text-up">+{compact(topBuy.netAmt)}</span>
                  </div>
                  <p className="text-xs text-muted">{topBuy.name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold text-up">{compact(topBuy.buyAmt)}</span></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold text-down">{compact(topBuy.sellAmt)}</span></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">LTP:</span> <span className="font-semibold">{priceMap.get(topBuy.symbol)?.ltp ? num(priceMap.get(topBuy.symbol)!.ltp) : "—"}</span></div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-3 text-lg font-bold text-foreground">Top Net Sell</h3>
              {topSell && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-down-bg p-3">
                    <Link href={`/stock/${topSell.symbol}`} className="font-bold text-primary hover:underline">
                      {topSell.symbol.replace(/\d+/g, "")}
                    </Link>
                    <span className="text-sm font-bold text-down">{compact(topSell.netAmt)}</span>
                  </div>
                  <p className="text-xs text-muted">{topSell.name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold text-up">{compact(topSell.buyAmt)}</span></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold text-down">{compact(topSell.sellAmt)}</span></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">LTP:</span> <span className="font-semibold">{priceMap.get(topSell.symbol)?.ltp ? num(priceMap.get(topSell.symbol)!.ltp) : "—"}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stocks Table */}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-bold text-foreground">All Traded Stocks ({sorted.length})</h3>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search symbol…"
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                  <th className="px-3 py-2 text-left font-semibold">Company</th>
                  <SortTh label="LTP" active={false} dir="desc" onClick={() => {}} />
                  <SortTh label="Change" active={false} dir="desc" onClick={() => {}} />
                  <SortTh label="Buy Amt" active={sortKey === "buyAmt"} dir={sortDir} onClick={() => toggleSort("buyAmt")} />
                  <SortTh label="Sell Amt" active={sortKey === "sellAmt"} dir={sortDir} onClick={() => toggleSort("sellAmt")} />
                  <SortTh label="Net Amt" active={sortKey === "netAmt"} dir={sortDir} onClick={() => toggleSort("netAmt")} />
                  <SortTh label="Net Qty" active={sortKey === "netQty"} dir={sortDir} onClick={() => toggleSort("netQty")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const live = priceMap.get(s.symbol);
                  return (
                    <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                      <td className="px-3 py-2 font-bold">
                        <Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol.replace(/\d+/g, "")}</Link>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-muted">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{live ? num(live.ltp) : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${live && live.change > 0 ? "text-up" : live && live.change < 0 ? "text-down" : "text-muted"}`}>
                        {live ? `${live.change > 0 ? "+" : ""}${live.change.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-up">{compact(s.buyAmt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-down">{compact(s.sellAmt)}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>
                        {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${s.netQty >= 0 ? "text-up" : "text-down"}`}>
                        {num(s.netQty)}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-muted">No stocks found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function SortTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: string; onClick: () => void }) {
  return (
    <th onClick={onClick} className="cursor-pointer select-none px-3 py-2 text-right font-semibold hover:text-primary">
      {label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
