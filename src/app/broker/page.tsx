"use client";
import { useState, useEffect, useMemo } from "react";
import { npr, num, compact } from "@/lib/format";

type StockRow = {
  symbol: string;
  name: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
};

type BrokerData = {
  broker: number;
  stocks: StockRow[];
  totals: { buyAmt: number; sellAmt: number; netAmt: number };
};

const BROKERS = Array.from({ length: 68 }, (_, i) => i + 1);

export default function BrokerAnalysisPage() {
  const [brokerId, setBrokerId] = useState(1);
  const [data, setData] = useState<BrokerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "stocks" | "chart">("overview");
  const [sortKey, setSortKey] = useState<"netAmt" | "buyAmt" | "sellAmt" | "netQty">("netAmt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setData(null);
    fetch(`/api/broker/${brokerId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError("Failed to load broker data"))
      .finally(() => setLoading(false));
  }, [brokerId]);

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

  const topBuy = sorted[0];
  const topSell = [...sorted].sort((a, b) => a.netAmt - b.netAmt)[0];
  const totalTrades = data?.stocks.length ?? 0;
  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;

  // Chart data: top 12 stocks by net amount
  const chartStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return [...data.stocks].sort((a, b) => b.netAmt - a.netAmt).slice(0, 12);
  }, [data]);
  const maxBar = useMemo(() => Math.max(...chartStocks.map((s) => Math.max(Math.abs(s.buyAmt), Math.abs(s.sellAmt))), 1), [chartStocks]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker Analysis</h1>
          <p className="text-sm text-muted">
            {data ? `Broker #${brokerId} · ${totalTrades} stocks traded` : "Select a broker to view analysis"}
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-full bg-surface p-1 border border-border">
        {(["overview", "stocks", "chart"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              tab === t ? "bg-primary text-white shadow" : "text-muted hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Overview" : t === "stocks" ? "Stocks" : "Chart"}
          </button>
        ))}
      </div>

      {loading && <div className="rounded-xl bg-surface p-8 text-center text-muted border border-border">Loading broker #{brokerId}…</div>}
      {error && <div className="rounded-xl bg-down-bg p-4 text-sm text-down">{error}</div>}

      {data && !loading && (
        <>
          {/* Overview Tab */}
          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Buy Amount" value={compact(data.totals.buyAmt)} color="text-up" />
                <StatCard label="Sell Amount" value={compact(data.totals.sellAmt)} color="text-down" />
                <StatCard label="Net Amount" value={compact(data.totals.netAmt)} color={data.totals.netAmt >= 0 ? "text-up" : "text-down"} />
                <StatCard label="Buy Ratio" value={`${buyRatio.toFixed(1)}%`} color={buyRatio > 50 ? "text-up" : "text-down"} />
              </div>

              {/* Bar Chart */}
              <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
                <h3 className="mb-4 text-lg font-bold text-foreground">Top Stocks by Net Amount</h3>
                <div className="flex items-end justify-between gap-2 border-b-2 border-border pb-0" style={{ height: 180 }}>
                  {chartStocks.map((s) => {
                    const buyH = (s.buyAmt / maxBar) * 140;
                    const sellH = (s.sellAmt / maxBar) * 140;
                    return (
                      <div key={s.symbol} className="flex flex-col items-center" style={{ width: "8%", minWidth: 28 }}>
                        <div className="flex gap-1 items-end" style={{ height: 140 }}>
                          <div className="w-[44%] rounded-t-lg bg-up shadow-sm" style={{ height: Math.max(buyH, 2), minHeight: 2 }} />
                          <div className="w-[44%] rounded-t-lg bg-down shadow-sm" style={{ height: Math.max(sellH, 2), minHeight: 2 }} />
                        </div>
                        <div className="mt-2 text-[10px] font-semibold text-muted truncate w-full text-center">{s.symbol.replace(/\d+/g, "")}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-6 text-xs font-medium">
                  <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-up" /> Buy</span>
                  <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-down" /> Sell</span>
                  <span className="ml-auto text-muted">{chartStocks.length} stocks shown</span>
                </div>
              </div>

              {/* Top Movers */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="mb-3 text-lg font-bold text-foreground">Top Net Buy</h3>
                {topBuy && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-xl bg-up-bg p-3">
                      <span className="font-bold text-foreground">{topBuy.symbol.replace(/\d+/g, "")}</span>
                      <span className="text-sm font-bold text-up">+{compact(topBuy.netAmt)}</span>
                    </div>
                    <p className="text-xs text-muted">{topBuy.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold">{compact(topBuy.buyAmt)}</span></div>
                      <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold">{compact(topBuy.sellAmt)}</span></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="mb-3 text-lg font-bold text-foreground">Top Net Sell</h3>
                {topSell && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-xl bg-down-bg p-3">
                      <span className="font-bold text-foreground">{topSell.symbol.replace(/\d+/g, "")}</span>
                      <span className="text-sm font-bold text-down">{compact(topSell.netAmt)}</span>
                    </div>
                    <p className="text-xs text-muted">{topSell.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold">{compact(topSell.buyAmt)}</span></div>
                      <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold">{compact(topSell.sellAmt)}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stocks Tab */}
          {tab === "stocks" && (
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
                    <SortTh label="Buy Amt" active={sortKey === "buyAmt"} dir={sortDir} onClick={() => toggleSort("buyAmt")} />
                    <SortTh label="Sell Amt" active={sortKey === "sellAmt"} dir={sortDir} onClick={() => toggleSort("sellAmt")} />
                    <SortTh label="Net Amt" active={sortKey === "netAmt"} dir={sortDir} onClick={() => toggleSort("netAmt")} />
                    <SortTh label="Net Qty" active={sortKey === "netQty"} dir={sortDir} onClick={() => toggleSort("netQty")} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                      <td className="px-3 py-2 font-bold text-primary">{s.symbol.replace(/\d+/g, "")}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-muted">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-up">{compact(s.buyAmt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-down">{compact(s.sellAmt)}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>
                        {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${s.netQty >= 0 ? "text-up" : "text-down"}`}>
                        {num(s.netQty)}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-muted">No stocks found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Chart Tab */}
          {tab === "chart" && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-lg font-bold text-foreground">Buy vs Sell Comparison</h3>
              <div className="space-y-3">
                {chartStocks.map((s) => {
                  const buyW = (s.buyAmt / maxBar) * 100;
                  const sellW = (s.sellAmt / maxBar) * 100;
                  return (
                    <div key={s.symbol} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground">{s.symbol.replace(/\d+/g, "")}</span>
                        <span className={s.netAmt >= 0 ? "text-up" : "text-down"}>
                          Net: {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <div className="h-5 rounded-l bg-up" style={{ width: `${buyW}%`, minWidth: 2 }} />
                        <div className="h-5 rounded-r bg-down" style={{ width: `${sellW}%`, minWidth: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
