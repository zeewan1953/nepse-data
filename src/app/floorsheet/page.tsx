"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, FloorSheet, FloorSheetItem, LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { num, compact } from "@/lib/format";

type Broker = { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type StockAgg = { symbol: string; name: string; qty: number; amount: number; trades: number };
type Analysis = {
  totals: { trades: number; sampled: number; qty: number; amount: number; brokers: number; stocks: number; truncated: boolean };
  netFlow: Broker[];
  topBuyers: Broker[];
  topSellers: Broker[];
  stocks: StockAgg[];
  generatedAt: number;
  error?: string;
};

type BrokerStock = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type BrokerResp = { broker: number; stocks: BrokerStock[]; totals: { buyAmt: number; sellAmt: number; netAmt: number }; error?: string };
type LiveResp = { data: LiveMarketData[]; count: number };

export default function FloorsheetDashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const { data, error, loading, updatedAt, refresh } = usePoll<Analysis>(
    "/api/floorsheet/analysis",
    open ? 20_000 : 5 * 60_000,
  );
  const { data: liveData } = usePoll<LiveResp>("/api/live", open ? 2_000 : 30_000);

  const priceMap = useMemo(() => {
    const m = new Map<string, { ltp: number; change: number }>();
    for (const r of liveData?.data ?? []) m.set(r.symbol, { ltp: r.lastTradedPrice, change: r.percentageChange });
    return m;
  }, [liveData]);

  const empty = data && data.totals.sampled === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker & Floorsheet Analysis</h1>
          <p className="text-sm text-muted">
            Broker activity, net flow, stock-wise trades & individual broker deep-dive
            {updatedAt && <> · updated {new Date(updatedAt).toLocaleTimeString("en-GB")}</>}
            {open ? " · auto 20s" : " · market closed"}
          </p>
        </div>
      </div>

      <AgentInsight analysis={data ?? null} onRefresh={refresh} refreshing={loading} />

      {error && <div className="rounded-lg bg-down-bg px-4 py-3 text-sm text-down">Error: {error}</div>}

      {empty && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="text-4xl">🕒</div>
          <p className="mt-3 font-semibold">Floorsheet khali cha</p>
          <p className="mt-1 text-sm text-muted">
            NEPSE le floorsheet (trades) market khulda (Sun–Thu, 11am–3pm) matra dincha. Market band huda clear huncha.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {data && !empty && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Trades" value={num(data.totals.trades)} sub={data.totals.truncated ? `analysing ${num(data.totals.sampled)}` : undefined} />
            <Stat label="Turnover" value={`Rs ${compact(data.totals.amount)}`} />
            <Stat label="Active Brokers" value={num(data.totals.brokers)} />
            <Stat label="Stocks Traded" value={num(data.totals.stocks)} />
          </div>

          {/* Net flow visualization */}
          <div className="grid gap-4 lg:grid-cols-2">
            <NetFlowCard title="Biggest Net Buyers" rows={data.netFlow.filter((b) => b.netAmt > 0).slice(0, 10)} tone="up" />
            <NetFlowCard title="Biggest Net Sellers" rows={data.netFlow.filter((b) => b.netAmt < 0).slice(-10).reverse()} tone="down" />
          </div>

          {/* Top buyers / sellers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BrokerTable title="Top Buyers (by value)" rows={data.topBuyers} mode="buy" />
            <BrokerTable title="Top Sellers (by value)" rows={data.topSellers} mode="sell" />
          </div>

          {/* Stock-wise activity */}
          <StockTable stocks={data.stocks} />
        </>
      )}

      {/* Individual Broker Deep-Dive */}
      <BrokerDeepDive priceMap={priceMap} />

      {loading && !data && <div className="py-10 text-center text-muted">Analysing floorsheet…</div>}
    </div>
  );
}

/* ─── Individual Broker Deep-Dive (merged from /broker) ─── */

function BrokerDeepDive({ priceMap }: { priceMap: Map<string, { ltp: number; change: number }> }) {
  const [brokerId, setBrokerId] = useState(1);
  const [input, setInput] = useState("1");
  const [filter, setFilter] = useState<"all" | "topBuy" | "topSell" | "netBuy" | "netSell">("all");
  const [data, setData] = useState<BrokerResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { setInput(String(brokerId)); }, [brokerId]);

  useEffect(() => {
    setLoading(true);
    setErr("");
    setData(null);
    fetch(`/api/broker/${brokerId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setData(j); })
      .catch(() => setErr("Failed to load broker data"))
      .finally(() => setLoading(false));
  }, [brokerId]);

  const chartStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return [...data.stocks].sort((a, b) => b.netAmt - a.netAmt).slice(0, 12);
  }, [data]);
  const maxBar = useMemo(() => Math.max(...chartStocks.map((s) => Math.max(s.buyAmt, s.sellAmt)), 1), [chartStocks]);
  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;

  return (
    <section className="space-y-5">
      {/* Broker search header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-foreground">
            <span className="mr-2 text-primary">🏢</span>Broker Deep-Dive
          </h2>
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface-2 px-4 py-1.5 shadow-sm">
            <span className="text-xs font-semibold text-muted">Broker #</span>
            <form
              onSubmit={(e) => { e.preventDefault(); const n = Number(input.replace(/\D/g, "")); if (n >= 1 && n <= 999) setBrokerId(n); }}
              className="flex items-center gap-2"
            >
              <input
                type="text" inputMode="numeric" value={input}
                onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
                className="w-14 bg-transparent text-sm font-semibold text-foreground outline-none" placeholder="1"
              />
              <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-700">
                Search
              </button>
            </form>
          </div>
        </div>
      </div>

      {loading && !data && <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">Loading broker #{brokerId}…</div>}
      {err && <div className="rounded-lg bg-down-bg p-4 text-sm text-down">{err}</div>}

      {data && !loading && (
        <>
          {/* Chart + Summary */}
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-foreground">📊 Buy vs Sell Activity</h3>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">Top {chartStocks.length}</span>
              </div>
              <div className="flex items-end justify-between gap-2 border-b-2 border-border pb-0" style={{ height: 180 }}>
                {chartStocks.map((s) => {
                  const buyH = Math.max((s.buyAmt / maxBar) * 140, 4);
                  const sellH = Math.max((s.sellAmt / maxBar) * 140, 4);
                  return (
                    <div key={s.symbol} className="flex flex-col items-center" style={{ width: "8%", minWidth: 28 }}>
                      <div className="flex items-end gap-0.5" style={{ height: 140, width: "100%" }}>
                        <div className="rounded-t-md bg-up shadow-sm" style={{ height: buyH, width: "46%", flexShrink: 0 }} />
                        <div className="rounded-t-md bg-down shadow-sm" style={{ height: sellH, width: "46%", flexShrink: 0 }} />
                      </div>
                      <div className="mt-1.5 w-full truncate text-center text-[9px] font-semibold text-muted">{s.symbol.replace(/\d+/g, "")}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-up" /> Buy</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-down" /> Sell</span>
                <span className="ml-auto flex gap-3 rounded-full bg-surface-2 px-3 py-1">
                  <span>Net: <b className={data.totals.netAmt >= 0 ? "text-up" : "text-down"}>{data.totals.netAmt >= 0 ? "+" : ""}{compact(data.totals.netAmt)}</b></span>
                  <span>Buy Ratio: <b>{buyRatio.toFixed(1)}%</b></span>
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-foreground">📄 Summary</h3>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">Broker #{brokerId}</span>
              </div>
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-2 p-3">
                <SummaryRow label="Total Buy" value={compact(data.totals.buyAmt)} color="text-up" />
                <SummaryRow label="Total Sell" value={compact(data.totals.sellAmt)} color="text-down" />
                <SummaryRow label="Net Amount" value={`${data.totals.netAmt >= 0 ? "+" : ""}${compact(data.totals.netAmt)}`} color={data.totals.netAmt >= 0 ? "text-up" : "text-down"} />
                <SummaryRow label="Total Stocks" value={String(data.stocks.length)} color="text-primary" />
                <SummaryRow label="Buy Ratio" value={`${buyRatio.toFixed(1)}%`} color="text-purple-600" />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "topBuy", label: "Top Buy" },
                    { key: "topSell", label: "Top Sell" },
                    { key: "netBuy", label: "Net Buy" },
                    { key: "netSell", label: "Net Sell" },
                  ] as const).map((f) => (
                    <button key={f.key} onClick={() => setFilter(filter === f.key ? "all" : f.key)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${filter === f.key ? "border-primary bg-primary text-white" : "border-border bg-surface text-foreground hover:bg-surface-2"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setFilter("all")}
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${filter === "all" ? "border-primary bg-primary text-white" : "border-border bg-surface text-foreground hover:bg-surface-2"}`}>
                  {filter === "all" ? "All" : "Reset"}
                </button>
              </div>
            </div>
          </div>

          {/* Top mover cards */}
          <div className="grid gap-5 lg:grid-cols-2">
            <TopMoverCard title="Top Net Buy" stocks={data.stocks} mode="buy" priceMap={priceMap} />
            <TopMoverCard title="Top Net Sell" stocks={data.stocks} mode="sell" priceMap={priceMap} />
          </div>

          {/* All traded stocks table */}
          <BrokerStockTable stocks={data.stocks} priceMap={priceMap} filter={filter} />
        </>
      )}
    </section>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-1.5 text-sm last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
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
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h3 className="mb-2 text-base font-bold text-foreground">{title}</h3>
      <div className={`flex items-center justify-between rounded-xl ${isBuy ? "bg-up-bg" : "bg-down-bg"} p-3`}>
        <Link href={`/stock/${top.symbol}`} className="font-bold text-foreground hover:underline">{top.symbol.replace(/\d+/g, "")}</Link>
        <span className={`text-sm font-bold ${isBuy ? "text-up" : "text-down"}`}>{isBuy ? "+" : ""}{compact(top.netAmt)}</span>
      </div>
      <p className="mt-1.5 text-xs text-muted">{top.name}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Buy:</span> <span className="font-semibold text-up">{compact(top.buyAmt)}</span></div>
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sell:</span> <span className="font-semibold text-down">{compact(top.sellAmt)}</span></div>
        <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">LTP:</span> <span className="font-semibold">{live ? num(live.ltp) : "—"}</span></div>
      </div>
    </div>
  );
}

function BrokerStockTable({ stocks, priceMap, filter }: { stocks: BrokerStock[]; priceMap: Map<string, { ltp: number; change: number }>; filter: string }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"netAmt" | "buyAmt" | "sellAmt" | "netQty">("netAmt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let list = [...stocks];
    if (filter === "topBuy") list = list.filter((s) => s.buyAmt > 0);
    if (filter === "topSell") list = list.filter((s) => s.sellAmt > 0);
    if (filter === "netBuy") list = list.filter((s) => s.netAmt > 0);
    if (filter === "netSell") list = list.filter((s) => s.netAmt < 0);
    if (q) list = list.filter((s) => s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
    list.sort((a, b) => { const av = a[sortKey] as number; const bv = b[sortKey] as number; return sortDir === "asc" ? av - bv : bv - av; });
    return list;
  }, [stocks, sortKey, sortDir, q, filter]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-bold text-foreground">All Traded Stocks ({filtered.length})</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…"
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary" />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">Symbol</th>
            <th className="px-3 py-2.5 text-left font-semibold">Company</th>
            <th className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-primary" onClick={() => toggleSort("netAmt")}>LTP</th>
            <th className="px-3 py-2.5 text-right font-semibold">Change</th>
            <th className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-primary" onClick={() => toggleSort("buyAmt")}>Buy Amt</th>
            <th className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-primary" onClick={() => toggleSort("sellAmt")}>Sell Amt</th>
            <th className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-primary" onClick={() => toggleSort("netAmt")}>Net Amt{sortKey === "netAmt" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
            <th className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-primary" onClick={() => toggleSort("netQty")}>Net Qty{sortKey === "netQty" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const live = priceMap.get(s.symbol);
            return (
              <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                <td className="px-3 py-2 font-bold"><Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol.replace(/\d+/g, "")}</Link></td>
                <td className="max-w-[200px] truncate px-3 py-2 text-muted">{s.name}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{live ? num(live.ltp) : "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${live && live.change > 0 ? "text-up" : live && live.change < 0 ? "text-down" : "text-muted"}`}>
                  {live ? `${live.change > 0 ? "+" : ""}${live.change.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-up">{compact(s.buyAmt)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-down">{compact(s.sellAmt)}</td>
                <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>{s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.netQty >= 0 ? "text-up" : "text-down"}`}>{num(s.netQty)}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No stocks found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Agent Insight (market-wide analysis) ─── */

type LiveChangeResp = { data: { symbol: string; percentageChange: number }[] };

function AgentInsight({ analysis, onRefresh, refreshing }: { analysis: Analysis | null; onRefresh: () => void; refreshing: boolean }) {
  const live = usePoll<LiveChangeResp>("/api/live", 60_000);
  const changeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r.percentageChange);
    return m;
  }, [live.data]);

  if (!analysis || analysis.totals.sampled === 0) {
    return (
      <section className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm">
        <h2 className="font-bold">🤖 Agent — Market Insight</h2>
        <p className="mt-1 text-sm text-muted">Market khulda (11am–3pm) floorsheet aaepachi auto insights dinchu.</p>
      </section>
    );
  }

  const buyers = analysis.netFlow.filter((b) => b.netAmt > 0).slice(0, 5);
  const sellers = analysis.netFlow.filter((b) => b.netAmt < 0).slice(-5).reverse();
  const moneyStocks = analysis.stocks.slice(0, 6);
  const accumulation = analysis.stocks.slice(0, 40).map((s) => ({ ...s, chg: changeMap.get(s.symbol) ?? 0 })).filter((s) => s.chg > 0).sort((a, b) => b.amount - a.amount).slice(0, 6);

  return (
    <section className="rounded-xl border border-primary/40 bg-gradient-to-br from-surface to-surface-2 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">🤖 Agent — Market Insight</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">auto from {num(analysis.totals.sampled)} trades</span>
          <button onClick={onRefresh} disabled={refreshing} className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary hover:bg-surface-2 disabled:opacity-50">
            {refreshing ? "⟳ Refreshing…" : "⟳ Refresh"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightBox title="🟢 Accumulating brokers" tone="up">
          {buyers.length ? buyers.map((b) => (<li key={b.id} className="flex justify-between"><span>Broker #{b.id}</span><span className="font-semibold text-up tabular-nums">+{compact(b.netAmt)}</span></li>)) : <li className="text-muted">—</li>}
        </InsightBox>
        <InsightBox title="🔴 Distributing brokers" tone="down">
          {sellers.length ? sellers.map((b) => (<li key={b.id} className="flex justify-between"><span>Broker #{b.id}</span><span className="font-semibold text-down tabular-nums">{compact(b.netAmt)}</span></li>)) : <li className="text-muted">—</li>}
        </InsightBox>
        <InsightBox title="📈 Being accumulated">
          {accumulation.length ? accumulation.map((s) => (<li key={s.symbol} className="flex justify-between"><Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol}</Link><span className="font-semibold text-up tabular-nums">+{s.chg.toFixed(1)}%</span></li>)) : <li className="text-muted">heavy-volume + rising stock chaina abai</li>}
        </InsightBox>
        <InsightBox title="💰 Money flowing into">
          {moneyStocks.map((s) => (<li key={s.symbol} className="flex justify-between"><Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol}</Link><span className="text-muted tabular-nums">{compact(s.amount)}</span></li>))}
        </InsightBox>
      </div>
      <p className="mt-3 text-sm">
        💡 <b>Summary:</b> Rs {compact(analysis.totals.amount)} turnover across {num(analysis.totals.brokers)} brokers.{" "}
        {buyers[0] && <>Top accumulator <b className="text-up">#{buyers[0].id}</b> (+{compact(buyers[0].netAmt)}). </>}
        {sellers[0] && <>Top distributor <b className="text-down">#{sellers[0].id}</b> ({compact(sellers[0].netAmt)}). </>}
        {accumulation[0] && <>Smart-money interest: <b>{accumulation.map((a) => a.symbol).slice(0, 3).join(", ")}</b>.</>}
      </p>
    </section>
  );
}

function InsightBox({ title, tone, children }: { title: string; tone?: "up" | "down"; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className={`mb-1 text-xs font-bold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"}`}>{title}</div>
      <ul className="space-y-0.5 text-sm tabular-nums">{children}</ul>
    </div>
  );
}

/* ─── Shared components ─── */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function NetFlowCard({ title, rows, tone }: { title: string; rows: Broker[]; tone: "up" | "down" }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.netAmt)));
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">{title}</div>
      <div className="space-y-2 p-4">
        {rows.length === 0 && <div className="py-4 text-center text-sm text-muted">None</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 font-bold">#{r.id}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-2">
              <div className={`h-full ${tone === "up" ? "bg-up" : "bg-down"}`} style={{ width: `${(Math.abs(r.netAmt) / max) * 100}%`, opacity: 0.75 }} />
            </div>
            <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${tone === "up" ? "text-up" : "text-down"}`}>{compact(Math.abs(r.netAmt))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrokerTable({ title, rows, mode }: { title: string; rows: Broker[]; mode: "buy" | "sell" }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase text-muted">
          <tr><th className="px-3 py-2 text-left">Broker</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">Net</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-2">
              <td className="px-3 py-1.5 font-semibold">#{r.id}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{num(mode === "buy" ? r.buyQty : r.sellQty)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{compact(mode === "buy" ? r.buyAmt : r.sellAmt)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${r.netAmt >= 0 ? "text-up" : "text-down"}`}>{r.netAmt >= 0 ? "+" : ""}{compact(r.netAmt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockTable({ stocks }: { stocks: StockAgg[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">
        Stock-wise Activity <span className="text-xs font-normal text-muted">(click for broker breakdown)</span>
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-right">Trades</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (<FragmentRow key={s.symbol} s={s} open={open === s.symbol} onToggle={() => setOpen(open === s.symbol ? null : s.symbol)} />))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ s, open, onToggle }: { s: StockAgg; open: boolean; onToggle: () => void }) {
  const sType = classifySymbol(s.symbol, s.name);
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-surface-2" onClick={onToggle}>
        <td className="px-3 py-1.5 font-bold text-primary"><Link href={`/stock/${s.symbol}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{s.symbol}</Link></td>
        <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[sType]}`}>{sType}</span></td>
        <td className="max-w-[220px] truncate px-3 py-1.5 text-muted">{s.name}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{num(s.trades)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{num(s.qty)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{compact(s.amount)}</td>
      </tr>
      {open && (<tr className="border-t border-border bg-surface-2"><td colSpan={6} className="px-3 py-2"><StockBrokers symbol={s.symbol} /></td></tr>)}
    </>
  );
}

function StockBrokers({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<Broker[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/floorsheet?symbol=${symbol}&size=500`, { cache: "no-store" });
      const j = (await res.json()) as FloorSheet;
      const items: FloorSheetItem[] = j.floorsheets?.content ?? [];
      const map = new Map<string, Broker>();
      const get = (id: string) => map.get(id) ?? { id, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, netQty: 0, netAmt: 0 };
      for (const t of items) {
        const b = get(t.buyerMemberId); b.buyQty += t.contractQuantity; b.buyAmt += t.contractAmount; map.set(t.buyerMemberId, b);
        const s = get(t.sellerMemberId); s.sellQty += t.contractQuantity; s.sellAmt += t.contractAmount; map.set(t.sellerMemberId, s);
      }
      const list = [...map.values()].map((b) => ({ ...b, netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt })).sort((a, b) => b.netAmt - a.netAmt);
      setRows(list);
    } catch (e) { setErr((e as Error).message); }
  }, [symbol]);
  useEffect(() => { load(); }, [load]);

  if (err) return <span className="text-sm text-down">{err}</span>;
  if (!rows) return <span className="text-sm text-muted">Loading {symbol} brokers…</span>;
  if (!rows.length) return <span className="text-sm text-muted">No trades for {symbol}.</span>;

  return (
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {rows.slice(0, 12).map((b) => (
        <div key={b.id} className="flex items-center justify-between rounded bg-surface px-2 py-1 text-xs">
          <span className="font-bold">#{b.id}</span>
          <span className="flex gap-2 tabular-nums">
            <span className="text-up">B {num(b.buyQty)}</span>
            <span className="text-down">S {num(b.sellQty)}</span>
            <span className={`font-semibold ${b.netQty >= 0 ? "text-up" : "text-down"}`}>{b.netQty >= 0 ? "+" : ""}{num(b.netQty)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
