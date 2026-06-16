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
  const [range, setRange] = useState<"TODAY" | "WEEK" | "MONTH">("TODAY");
  const [data, setData] = useState<BrokerResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const priceMap = useMemo(() => {
    const m = new Map<string, { ltp: number; change: number }>();
    for (const r of liveData?.data ?? []) m.set(r.symbol, { ltp: r.lastTradedPrice, change: r.percentageChange });
    return m;
  }, [liveData]);

  const chartStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return [...data.stocks].sort((a, b) => b.netAmt - a.netAmt).slice(0, 12);
  }, [data]);
  const maxBar = useMemo(() => Math.max(...chartStocks.map((s) => Math.max(Math.abs(s.buyAmt), Math.abs(s.sellAmt))), 1), [chartStocks]);

  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">
            <span className="mr-2 text-primary">📊</span>Broker Analysis
          </h1>
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-1.5 shadow-sm">
            <span className="text-muted">🏢</span>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-foreground outline-none"
            >
              {BROKERS.map((b) => (
                <option key={b} value={b}>Broker #{b}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-full border border-border bg-surface px-5 py-2 shadow-sm">
          <span className="text-sm font-medium text-foreground">{today}</span>
          {open && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-up">
              <span className="h-2 w-2 animate-pulse rounded-full bg-up" />
              LIVE
            </span>
          )}
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-full border border-border bg-surface p-1 shadow-sm">
        {(["TODAY", "WEEK", "MONTH"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
              range === r ? "bg-primary text-white shadow" : "text-muted hover:bg-surface-2"
            }`}
          >
            {r === "TODAY" ? "📅" : r === "WEEK" ? "🗓" : "📆"} {r}
          </button>
        ))}
      </div>

      {loading && !data && <div className="rounded-[28px] border border-border bg-surface p-10 text-center text-muted">Loading broker #{brokerId}…</div>}
      {error && <div className="rounded-[28px] bg-down-bg p-4 text-sm text-down">{error}</div>}

      {data && !loading && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-[28px] border border-border bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <span>📊</span> Buy vs Sell Activity
                </h3>
                <span className="rounded-full border border-border bg-surface-2 px-4 py-1 text-xs font-semibold text-muted">
                  Top {chartStocks.length} stocks
                </span>
              </div>

              <div className="flex items-end justify-between gap-2 border-b-2 border-border pb-0" style={{ height: 190 }}>
                {chartStocks.map((s) => {
                  const buyH = (s.buyAmt / maxBar) * 150;
                  const sellH = (s.sellAmt / maxBar) * 150;
                  return (
                    <div key={s.symbol} className="flex flex-col items-center" style={{ width: "8%", minWidth: 28 }}>
                      <div className="flex items-end gap-1" style={{ height: 150 }}>
                        <div className="w-[44%] rounded-t-lg bg-up shadow-sm" style={{ height: Math.max(buyH, 4) }} />
                        <div className="w-[44%] rounded-t-lg bg-down shadow-sm" style={{ height: Math.max(sellH, 4) }} />
                      </div>
                      <div className="mt-2 w-full truncate text-center text-[10px] font-semibold text-muted">{s.symbol.replace(/\d+/g, "")}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-6 text-sm font-medium">
                <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-up" /> Buy</span>
                <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-down" /> Sell</span>
                <span className="ml-auto flex gap-4 rounded-full bg-surface-2 px-4 py-1 text-xs">
                  <span>Net: <b className={data.totals.netAmt >= 0 ? "text-up" : "text-down"}>{data.totals.netAmt >= 0 ? "+" : ""}{compact(data.totals.netAmt)}</b></span>
                  <span>Buy Ratio: <b>{buyRatio.toFixed(1)}%</b></span>
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <span>📄</span> Summary
                </h3>
                <span className="rounded-full border border-border bg-surface-2 px-4 py-1 text-xs font-semibold text-muted">
                  Broker #{brokerId}
                </span>
              </div>

              <div className="space-y-2 rounded-[20px] border border-border bg-surface-2 p-4">
                <SummaryRow label="Total Buy Amount" value={compact(data.totals.buyAmt)} color="green" />
                <SummaryRow label="Total Sell Amount" value={compact(data.totals.sellAmt)} color="red" />
                <SummaryRow label="Net Amount" value={`${data.totals.netAmt >= 0 ? "+" : ""}${compact(data.totals.netAmt)}`} color={data.totals.netAmt >= 0 ? "green" : "red"} />
                <SummaryRow label="Total Stocks" value={String(data.stocks.length)} color="blue" />
                <SummaryRow label="Buy Ratio" value={`${buyRatio.toFixed(1)}%`} color="purple" />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between rounded-[24px] border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap gap-2">
                  {["Top Buy", "Top Sell", "Net Buy", "Net Sell"].map((f) => (
                    <span key={f} className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground">
                      {f}
                    </span>
                  ))}
                </div>
                <button className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-foreground">
                  <span>🔍</span> Filter
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopMoverCard title="Top Net Buy" stocks={data.stocks} mode="buy" priceMap={priceMap} />
            <TopMoverCard title="Top Net Sell" stocks={data.stocks} mode="sell" priceMap={priceMap} />
          </div>

          <StockTable stocks={data.stocks} priceMap={priceMap} />
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "purple" }) {
  const colorClass = { green: "text-up", red: "text-down", blue: "text-primary", purple: "text-purple-600" }[color];
  return (
    <div className="flex justify-between border-b border-border pb-2 text-sm last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={`font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function TopMoverCard({ title, stocks, mode, priceMap }: { title: string; stocks: BrokerStock[]; mode: "buy" | "sell"; priceMap: Map<string, { ltp: number; change: number }> }) {
  const sorted = [...stocks].sort((a, b) => (mode === "buy" ? b.netAmt - a.netAmt : a.netAmt - b.netAmt));
  const top = sorted[0];
  if (!top) return null;
  const live = priceMap.get(top.symbol);
  const isBuy = mode === "buy";

  return (
    <div className="rounded-[28px] border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-3 text-lg font-bold text-foreground">{title}</h3>
      <div className={`flex items-center justify-between rounded-xl ${isBuy ? "bg-up-bg" : "bg-down-bg"} p-3`}>
        <Link href={`/stock/${top.symbol}`} className="font-bold text-foreground hover:underline">
          {top.symbol.replace(/\d+/g, "")}
        </Link>
        <span className={`text-sm font-bold ${isBuy ? "text-up" : "text-down"}`}>
          {isBuy ? "+" : ""}{compact(top.netAmt)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">{top.name}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold text-up">{compact(top.buyAmt)}</span></div>
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold text-down">{compact(top.sellAmt)}</span></div>
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">LTP:</span> <span className="font-semibold">{live ? num(live.ltp) : "—"}</span></div>
      </div>
    </div>
  );
}

function StockTable({ stocks, priceMap }: { stocks: BrokerStock[]; priceMap: Map<string, { ltp: number; change: number }> }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"netAmt" | "buyAmt" | "sellAmt" | "netQty">("netAmt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    let list = [...stocks];
    if (q) list = list.filter((s) => s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
    list.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [stocks, sortKey, sortDir, q]);

  return (
    <div className="overflow-x-auto rounded-[28px] border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
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
            <th className="px-4 py-3 text-left font-semibold">Symbol</th>
            <th className="px-4 py-3 text-left font-semibold">Company</th>
            <SortTh label="LTP" />
            <SortTh label="Change" />
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
                <td className="px-4 py-2.5 font-bold">
                  <Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol.replace(/\d+/g, "")}</Link>
                </td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-muted">{s.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{live ? num(live.ltp) : "—"}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${live && live.change > 0 ? "text-up" : live && live.change < 0 ? "text-down" : "text-muted"}`}>
                  {live ? `${live.change > 0 ? "+" : ""}${live.change.toFixed(2)}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-up">{compact(s.buyAmt)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-down">{compact(s.sellAmt)}</td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>
                  {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${s.netQty >= 0 ? "text-up" : "text-down"}`}>
                  {num(s.netQty)}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No stocks found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortTh({ label, active, dir, onClick }: { label: string; active?: boolean; dir?: string; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={`px-4 py-3 text-right font-semibold ${onClick ? "cursor-pointer hover:text-primary" : ""}`}>
      {label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
