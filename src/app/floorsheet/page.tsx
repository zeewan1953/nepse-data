"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { num, compact } from "@/lib/format";

/* ─── Types ─── */
type Broker = { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type StockAgg = { symbol: string; name: string; qty: number; amount: number; trades: number; avgPrice?: number };
type DateOverview = {
  date: string;
  totals: { trades: number; qty: number; amount: number; brokers: number; stocks: number };
  netFlow: Broker[]; topBuyers: Broker[]; topSellers: Broker[]; stocks: StockAgg[];
  dates: string[];
};
type BrokerStock = {
  symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number;
  netQty: number; netAmt: number; buyTrades: number; sellTrades: number;
  avgBuyPrice: number; avgSellPrice: number;
  aggressive: "buy" | "sell" | "mixed";
};
type BrokerResp = {
  date: string; broker: string;
  stocks: BrokerStock[];
  totals: {
    buyAmt: number; sellAmt: number; netAmt: number; buyQty: number; sellQty: number;
    avgBuyPrice: number; avgSellPrice: number; buyTrades: number; sellTrades: number;
  };
};
type StockBrokerEntry = {
  id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number;
  netQty: number; netAmt: number; avgBuyPrice: number; avgSellPrice: number;
  action: "aggressive-buy" | "aggressive-sell" | "hold" | "none";
};
type StockResp = {
  date: string;
  stocks: StockAgg[];
  stockBrokers: Record<string, StockBrokerEntry[]>;
};
type SyncResp = { date: string; tradeCount: number; syncedAt: number; dates: string[] };

/* ─── Helpers ─── */
function todayStr(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }); }

/* ─── Main Dashboard ─── */
export default function FloorsheetDashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<"overview" | "broker" | "stock">("overview");

  // Unified search state
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState<"none" | "broker" | "stock">("none");
  const [searchValue, setSearchValue] = useState("");

  // Auto-sync
  const sync = usePoll<SyncResp>("/api/floorsheet/sync", open ? 3_000 : 60_000);
  useEffect(() => { if (sync.data?.date) setDate(sync.data.date); }, [sync.data?.date]);
  const availableDates = sync.data?.dates ?? [];

  // Handle unified search
  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const val = searchInput.trim();
    if (!val) { setSearchType("none"); setSearchValue(""); return; }
    if (/^\d+$/.test(val)) {
      setSearchType("broker");
      setSearchValue(val);
      setTab("broker");
    } else {
      setSearchType("stock");
      setSearchValue(val.toUpperCase());
      setTab("stock");
    }
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchType("none");
    setSearchValue("");
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker & Floorsheet Analysis</h1>
          <p className="text-sm text-muted">
            DB-backed · {sync.data ? `${num(sync.data.tradeCount)} trades synced` : "syncing…"}
            {sync.data?.syncedAt ? ` · ${new Date(sync.data.syncedAt).toLocaleTimeString("en-GB")}` : ""}
            {open ? " · auto 3s" : " · market closed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/broker-flow" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20">
            📊 Advanced Broker Flow
          </Link>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
          />
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${open ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
            {open ? "🔴 Live" : "⏸ Paused"}
          </span>
        </div>
      </div>

      {/* Unified Search Bar */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
        <span className="text-lg">🔍</span>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
          placeholder="Search stock symbol (e.g. NABIL) or broker number (e.g. 42)…"
        />
        <button type="submit" className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">
          Search
        </button>
        {searchType !== "none" && (
          <button type="button" onClick={clearSearch} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
            ✕ Clear
          </button>
        )}
        {searchType !== "none" && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${searchType === "broker" ? "bg-primary/15 text-primary" : "bg-up-bg text-up"}`}>
            {searchType === "broker" ? `🏢 Broker #${searchValue}` : `📈 ${searchValue}`}
          </span>
        )}
      </form>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          { key: "overview", label: "📊 Overview" },
          { key: "broker", label: "🏢 Broker View" },
          { key: "stock", label: "📈 Stock View" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && <OverviewTab date={date} />}
      {tab === "broker" && <BrokerTab date={date} brokerId={searchType === "broker" ? searchValue : null} />}
      {tab === "stock" && <StockTab date={date} filterSymbol={searchType === "stock" ? searchValue : null} />}

      {/* Agent Insight */}
      <AgentInsight marketOpen={open ?? false} />

      {/* Broker Deep-Dive */}
      <BrokerDeepDive marketOpen={open ?? false} />
    </div>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab({ date }: { date: string }) {
  const { data, loading } = usePoll<DateOverview>(`/api/fs-date?date=${date}`, 3_000);

  if (loading && !data) return <div className="py-10 text-center text-muted">Loading floorsheet data…</div>;
  if (!data || data.totals.trades === 0) return <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">No data for {date}. Pick another date.</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Trades" value={num(data.totals.trades)} />
        <Stat label="Turnover" value={`Rs ${compact(data.totals.amount)}`} />
        <Stat label="Active Brokers" value={num(data.totals.brokers)} />
        <Stat label="Stocks Traded" value={num(data.totals.stocks)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <NetFlowCard title="Biggest Net Buyers" rows={data.netFlow.filter((b) => b.netAmt > 0).slice(0, 10)} tone="up" />
        <NetFlowCard title="Biggest Net Sellers" rows={data.netFlow.filter((b) => b.netAmt < 0).slice(-10).reverse()} tone="down" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BrokerTable title="Top Buyers (by value)" rows={data.topBuyers} mode="buy" />
        <BrokerTable title="Top Sellers (by value)" rows={data.topSellers} mode="sell" />
      </div>
      <StockTable stocks={data.stocks} />
    </div>
  );
}

/* ─── Broker Tab ─── */
function BrokerTab({ date, brokerId: externalId }: { date: string; brokerId: string | null }) {
  const [brokerId, setBrokerId] = useState(externalId ?? "1");
  const [search, setSearch] = useState(externalId ?? "1");
  const { data, loading } = usePoll<BrokerResp>(`/api/fs-broker?date=${date}&broker=${brokerId}`, 3_000);

  // Sync with external search
  useEffect(() => {
    if (externalId) { setBrokerId(externalId); setSearch(externalId); }
  }, [externalId]);

  const chartStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return [...data.stocks].sort((a, b) => b.netAmt - a.netAmt).slice(0, 12);
  }, [data]);
  const maxBar = useMemo(() => Math.max(...chartStocks.map((s) => Math.max(s.buyAmt, s.sellAmt)), 1), [chartStocks]);
  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Inline broker search */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm font-semibold text-muted">Broker #</span>
        <form onSubmit={(e) => { e.preventDefault(); const n = search.replace(/\D/g, ""); if (n) setBrokerId(n); }} className="flex flex-1 items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
            className="w-20 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary" placeholder="1" />
          <button type="submit" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">Search</button>
        </form>
        <span className="text-xs text-muted">auto 3s</span>
      </div>

      {loading && !data && <div className="py-10 text-center text-muted">Loading broker #{brokerId}…</div>}

      {data && (
        <>
          {/* Summary with avg prices */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Buy Amt" value={compact(data.totals.buyAmt)} sub="text-up" />
            <Stat label="Sell Amt" value={compact(data.totals.sellAmt)} />
            <Stat label="Net Amt" value={`${data.totals.netAmt >= 0 ? "+" : ""}${compact(data.totals.netAmt)}`} />
            <Stat label="Avg Buy Price" value={data.totals.avgBuyPrice > 0 ? `Rs ${data.totals.avgBuyPrice.toFixed(2)}` : "—"} />
            <Stat label="Avg Sell Price" value={data.totals.avgSellPrice > 0 ? `Rs ${data.totals.avgSellPrice.toFixed(2)}` : "—"} />
            <Stat label="Stocks" value={String(data.stocks.length)} sub={`Buy ratio: ${buyRatio.toFixed(1)}%`} />
          </div>

          {/* Buy vs Sell Bar Chart */}
          {chartStocks.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-base font-bold">📊 Buy vs Sell — Broker #{brokerId}</h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 180 }}>
                {chartStocks.map((s) => {
                  const buyH = Math.max((s.buyAmt / maxBar) * 140, 4);
                  const sellH = Math.max((s.sellAmt / maxBar) * 140, 4);
                  return (
                    <div key={s.symbol} className="flex flex-col items-center" style={{ width: "8%", minWidth: 28 }}>
                      <div className="flex items-end gap-0.5" style={{ height: 140, width: "100%" }}>
                        <div className="rounded-t-md bg-up" style={{ height: buyH, width: "46%" }} title={`Buy: ${compact(s.buyAmt)}`} />
                        <div className="rounded-t-md bg-down" style={{ height: sellH, width: "46%" }} title={`Sell: ${compact(s.sellAmt)}`} />
                      </div>
                      <div className="mt-1 w-full truncate text-center text-[9px] font-semibold text-muted">{s.symbol.replace(/\d+/g, "")}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-up" /> Buy</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-down" /> Sell</span>
                <span className="ml-auto">Net: <b className={data.totals.netAmt >= 0 ? "text-up" : "text-down"}>{data.totals.netAmt >= 0 ? "+" : ""}{compact(data.totals.netAmt)}</b></span>
              </div>
            </div>
          )}

          {/* Stock table with avg prices + aggressive */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-3 font-bold">Stocks traded by Broker #{brokerId} ({data.stocks.length})</div>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-right">Buy Qty</th>
                  <th className="px-3 py-2 text-right">Buy Amt</th>
                  <th className="px-3 py-2 text-right">Avg Buy ₹</th>
                  <th className="px-3 py-2 text-right">Sell Qty</th>
                  <th className="px-3 py-2 text-right">Sell Amt</th>
                  <th className="px-3 py-2 text-right">Avg Sell ₹</th>
                  <th className="px-3 py-2 text-right">Net Amt</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.stocks.map((s) => (
                  <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                    <td className="px-3 py-2 font-bold"><Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol.replace(/\d+/g, "")}</Link></td>
                    <td className="px-3 py-2 text-right text-up tabular-nums">{num(s.buyQty)}</td>
                    <td className="px-3 py-2 text-right text-up tabular-nums">{compact(s.buyAmt)}</td>
                    <td className="px-3 py-2 text-right text-up tabular-nums">{s.avgBuyPrice > 0 ? `Rs ${s.avgBuyPrice.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right text-down tabular-nums">{num(s.sellQty)}</td>
                    <td className="px-3 py-2 text-right text-down tabular-nums">{compact(s.sellAmt)}</td>
                    <td className="px-3 py-2 text-right text-down tabular-nums">{s.avgSellPrice > 0 ? `Rs ${s.avgSellPrice.toFixed(2)}` : "—"}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>{s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        s.aggressive === "buy" ? "bg-up-bg text-up" :
                        s.aggressive === "sell" ? "bg-down-bg text-down" :
                        "bg-surface-2 text-muted"
                      }`}>
                        {s.aggressive === "buy" ? "🟢 Agg Buy" : s.aggressive === "sell" ? "🔴 Agg Sell" : "Mixed"}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.stocks.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">No trades for this broker on {date}.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Stock Tab ─── */
function StockTab({ date, filterSymbol }: { date: string; filterSymbol: string | null }) {
  const [query, setQuery] = useState("");
  const effectiveQuery = filterSymbol ?? query;
  const { data, loading } = usePoll<StockResp>(`/api/fs-stock?date=${date}${effectiveQuery ? `&symbol=${effectiveQuery}` : ""}`, 3_000);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Sync external filter
  useEffect(() => { if (filterSymbol) setQuery(filterSymbol); }, [filterSymbol]);

  const filtered = useMemo(() => {
    if (!data?.stocks) return [];
    if (filterSymbol) return data.stocks; // API already filtered
    if (!query) return data.stocks;
    const q = query.toLowerCase();
    return data.stocks.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [data, query, filterSymbol]);

  if (loading && !data) return <div className="py-10 text-center text-muted">Loading stock data…</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Search (only shown when no external filter) */}
      {!filterSymbol && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <span className="text-sm font-semibold text-muted">🔍</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
            placeholder="Search stock symbol or name…" />
          <span className="text-xs text-muted">{filtered.length} stocks</span>
        </div>
      )}
      {filterSymbol && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-bold text-primary">📈 Showing: {filterSymbol}</span>
          <span className="text-xs text-muted">{filtered.length} result(s)</span>
        </div>
      )}

      {/* Stock list with expandable broker breakdown */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-right">Trades</th>
              <th className="px-3 py-2 text-right">Quantity</th>
              <th className="px-3 py-2 text-right">Turnover</th>
              <th className="px-3 py-2 text-right">Avg Price</th>
              <th className="px-3 py-2 text-center">Brokers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const brokers = data.stockBrokers[s.symbol] ?? [];
              const isExpanded = expanded === s.symbol;
              return (
                <StockRow key={s.symbol} s={s} brokers={brokers} expanded={isExpanded} onToggle={() => setExpanded(isExpanded ? null : s.symbol)} />
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No stocks found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockRow({ s, brokers, expanded, onToggle }: {
  s: StockAgg; brokers: StockBrokerEntry[];
  expanded: boolean; onToggle: () => void;
}) {
  const aggBuyBrokers = brokers.filter((b) => b.action === "aggressive-buy");
  const aggSellBrokers = brokers.filter((b) => b.action === "aggressive-sell");
  const holdBrokers = brokers.filter((b) => b.action === "hold");
  const maxBrokerAmt = Math.max(...brokers.map((b) => Math.max(b.buyAmt, b.sellAmt)), 1);

  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-surface-2" onClick={onToggle}>
        <td className="px-3 py-2 font-bold text-primary">
          <Link href={`/stock/${s.symbol}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{s.symbol.replace(/\d+/g, "")}</Link>
        </td>
        <td className="max-w-[200px] truncate px-3 py-2 text-muted">{s.name}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(s.trades)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(s.qty)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{compact(s.amount)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.avgPrice ? `Rs ${s.avgPrice.toFixed(2)}` : "—"}</td>
        <td className="px-3 py-2 text-center">
          <span className="flex items-center justify-center gap-1.5 text-xs">
            <span className="rounded bg-up-bg px-1.5 py-0.5 font-semibold text-up">{aggBuyBrokers.length}B</span>
            <span className="rounded bg-down-bg px-1.5 py-0.5 font-semibold text-down">{aggSellBrokers.length}S</span>
            {holdBrokers.length > 0 && <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-muted">{holdBrokers.length}H</span>}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border bg-surface-2">
          <td colSpan={7} className="px-4 py-3">
            <div className="mb-2 text-xs font-bold text-muted">Broker Breakdown — Aggressive Buy / Sell / Hold ({brokers.length} brokers)</div>
            {/* Aggressive brokers highlight */}
            {(aggBuyBrokers.length > 0 || aggSellBrokers.length > 0) && (
              <div className="mb-3 flex flex-wrap gap-2">
                {aggBuyBrokers.map((b) => (
                  <span key={b.id} className="rounded-full bg-up-bg px-2 py-0.5 text-xs font-bold text-up">
                    🟢 #{b.id} Agg Buy {compact(b.buyAmt)}
                  </span>
                ))}
                {aggSellBrokers.map((b) => (
                  <span key={b.id} className="rounded-full bg-down-bg px-2 py-0.5 text-xs font-bold text-down">
                    🔴 #{b.id} Agg Sell {compact(b.sellAmt)}
                  </span>
                ))}
              </div>
            )}
            {/* Bar chart */}
            {brokers.length > 0 && (
              <div className="mb-3 flex items-end gap-1.5 overflow-x-auto" style={{ maxHeight: 160 }}>
                {brokers.slice(0, 20).map((b) => {
                  const buyH = Math.max((b.buyAmt / maxBrokerAmt) * 120, 3);
                  const sellH = Math.max((b.sellAmt / maxBrokerAmt) * 120, 3);
                  return (
                    <div key={b.id} className="flex flex-col items-center" style={{ minWidth: 24 }}>
                      <div className="flex items-end gap-px" style={{ height: 120 }}>
                        <div className="rounded-t bg-up" style={{ height: buyH, width: 10 }} title={`Buy: ${compact(b.buyAmt)}`} />
                        <div className="rounded-t bg-down" style={{ height: sellH, width: 10 }} title={`Sell: ${compact(b.sellAmt)}`} />
                      </div>
                      <div className="mt-0.5 text-[8px] font-bold text-muted">#{b.id}</div>
                      <div className={`text-[8px] font-bold ${
                        b.action === "aggressive-buy" ? "text-up" : b.action === "aggressive-sell" ? "text-down" : "text-muted"
                      }`}>
                        {b.action === "aggressive-buy" ? "AGG.B" : b.action === "aggressive-sell" ? "AGG.S" : "HOLD"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Table with avg prices */}
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Broker</th>
                    <th className="px-2 py-1 text-right">Buy Qty</th>
                    <th className="px-2 py-1 text-right">Avg Buy ₹</th>
                    <th className="px-2 py-1 text-right">Sell Qty</th>
                    <th className="px-2 py-1 text-right">Avg Sell ₹</th>
                    <th className="px-2 py-1 text-right">Net Amt</th>
                    <th className="px-2 py-1 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {brokers.slice(0, 30).map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-2 py-1 font-bold">#{b.id}</td>
                      <td className="px-2 py-1 text-right text-up tabular-nums">{b.buyQty > 0 ? num(b.buyQty) : "—"}</td>
                      <td className="px-2 py-1 text-right text-up tabular-nums">{b.avgBuyPrice > 0 ? `Rs ${b.avgBuyPrice.toFixed(2)}` : "—"}</td>
                      <td className="px-2 py-1 text-right text-down tabular-nums">{b.sellQty > 0 ? num(b.sellQty) : "—"}</td>
                      <td className="px-2 py-1 text-right text-down tabular-nums">{b.avgSellPrice > 0 ? `Rs ${b.avgSellPrice.toFixed(2)}` : "—"}</td>
                      <td className={`px-2 py-1 text-right font-semibold tabular-nums ${b.netAmt >= 0 ? "text-up" : "text-down"}`}>{b.netAmt >= 0 ? "+" : ""}{compact(b.netAmt)}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`rounded px-1 text-[9px] font-bold uppercase ${
                          b.action === "aggressive-buy" ? "bg-up-bg text-up" :
                          b.action === "aggressive-sell" ? "bg-down-bg text-down" :
                          "bg-surface-2 text-muted"
                        }`}>
                          {b.action === "aggressive-buy" ? "AGG.BUY" : b.action === "aggressive-sell" ? "AGG.SELL" : "HOLD"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {brokers.length === 0 && <div className="text-sm text-muted">No broker data.</div>}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Agent Insight ─── */
type Analysis = {
  totals: { trades: number; sampled: number; qty: number; amount: number; brokers: number; stocks: number; truncated: boolean };
  netFlow: Broker[]; topBuyers: Broker[]; topSellers: Broker[]; stocks: StockAgg[]; generatedAt: number; error?: string;
};
type LiveChangeResp = { data: { symbol: string; percentageChange: number }[] };

function AgentInsight({ marketOpen }: { marketOpen: boolean }) {
  const { data, updatedAt } = usePoll<Analysis>("/api/floorsheet/analysis", marketOpen ? 3_000 : 60_000);
  const live = usePoll<LiveChangeResp>("/api/live", marketOpen ? 3_000 : 60_000);
  const retained = useRef<Analysis | null>(null);
  if (data && data.totals.sampled > 0) retained.current = data;
  const analysis = data?.totals.sampled ? data : retained.current;

  const changeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r.percentageChange);
    return m;
  }, [live.data]);

  if (!analysis || analysis.totals.sampled === 0) {
    return (
      <section className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm">
        <h2 className="font-bold">🤖 Agent — Market Insight</h2>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${marketOpen ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
          {marketOpen ? "🔴 Live · waiting for data…" : "⏸ Paused"}
        </span>
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
        <div className="flex items-center gap-2">
          <h2 className="font-bold">🤖 Agent — Market Insight</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${marketOpen ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
            {marketOpen ? "🔴 Live" : "⏸ Paused"}{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("en-GB")}` : ""}
          </span>
        </div>
        <span className="text-xs text-muted">auto from {num(analysis.totals.sampled)} trades · 3s refresh</span>
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
  const [openSym, setOpenSym] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">Stock-wise Activity</div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-right">Trades</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => {
              const sType = classifySymbol(s.symbol, s.name);
              return (
                <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                  <td className="px-3 py-1.5 font-bold text-primary"><Link href={`/stock/${s.symbol}`} className="hover:underline">{s.symbol}</Link></td>
                  <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[sType]}`}>{sType}</span></td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 text-muted">{s.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(s.trades)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(s.qty)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{compact(s.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Individual Broker Deep-Dive (live API) ─── */
type LiveBrokerStock = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number; ltp: number; change: number; volume: number };
type LiveBrokerResp = {
  broker: number; stocks: LiveBrokerStock[]; totals: { buyAmt: number; sellAmt: number; netAmt: number };
  accumulation: LiveBrokerStock[]; distribution: LiveBrokerStock[]; liveCount: number; asOf: string; error?: string;
};

function BrokerDeepDive({ marketOpen }: { marketOpen: boolean }) {
  const [brokerId, setBrokerId] = useState(1);
  const [input, setInput] = useState("1");
  const { data, error, loading, updatedAt } = usePoll<LiveBrokerResp>(`/api/broker-live/${brokerId}`, marketOpen ? 3_000 : 60_000);
  useEffect(() => { setInput(String(brokerId)); }, [brokerId]);

  const chartStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return [...data.stocks].sort((a, b) => b.netAmt - a.netAmt).slice(0, 12);
  }, [data]);
  const maxBar = useMemo(() => Math.max(...chartStocks.map((s) => Math.max(s.buyAmt, s.sellAmt)), 1), [chartStocks]);
  const buyRatio = data ? (data.totals.buyAmt / (data.totals.buyAmt + data.totals.sellAmt) * 100) : 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold"><span className="mr-2 text-primary">🏢</span>Broker Deep-Dive (Live)</h2>
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface-2 px-4 py-1.5">
            <span className="text-xs font-semibold text-muted">Broker #</span>
            <form onSubmit={(e) => { e.preventDefault(); const n = Number(input.replace(/\D/g, "")); if (n >= 1 && n <= 999) setBrokerId(n); }} className="flex items-center gap-2">
              <input type="text" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
                className="w-14 bg-transparent text-sm font-semibold outline-none" placeholder="1" />
              <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-700">Search</button>
            </form>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {updatedAt && (
            <span className={`rounded-full px-2.5 py-1 font-semibold ${marketOpen ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
              {marketOpen ? "🔴 Live" : "⏸ Paused"} · {new Date(updatedAt).toLocaleTimeString("en-GB")}
            </span>
          )}
        </div>
      </div>

      {loading && !data && <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">Loading broker #{brokerId}…</div>}
      {error && <div className="rounded-lg bg-down-bg p-4 text-sm text-down">{error}</div>}

      {data && !loading && (
        <>
          {(data.accumulation.length > 0 || data.distribution.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {data.accumulation.length > 0 && (
                <div className="rounded-2xl border border-up/30 bg-up-bg p-4">
                  <h3 className="mb-2 text-sm font-bold text-up">🟢 Accumulation</h3>
                  {data.accumulation.map((s) => (
                    <div key={s.symbol} className="flex items-center justify-between text-sm">
                      <Link href={`/stock/${s.symbol}`} className="font-semibold hover:underline">{s.symbol.replace(/\d+/g, "")}</Link>
                      <span className="flex gap-3 tabular-nums"><span className="text-up">+{compact(s.netAmt)}</span><span className="text-up">+{s.change.toFixed(2)}%</span></span>
                    </div>
                  ))}
                </div>
              )}
              {data.distribution.length > 0 && (
                <div className="rounded-2xl border border-down/30 bg-down-bg p-4">
                  <h3 className="mb-2 text-sm font-bold text-down">🔴 Distribution</h3>
                  {data.distribution.map((s) => (
                    <div key={s.symbol} className="flex items-center justify-between text-sm">
                      <Link href={`/stock/${s.symbol}`} className="font-semibold hover:underline">{s.symbol.replace(/\d+/g, "")}</Link>
                      <span className="flex gap-3 tabular-nums"><span className="text-down">{compact(s.netAmt)}</span><span className="text-down">{s.change.toFixed(2)}%</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-base font-bold">📊 Buy vs Sell Activity</h3>
              <div className="flex items-end justify-between gap-2" style={{ height: 180 }}>
                {chartStocks.map((s) => {
                  const buyH = Math.max((s.buyAmt / maxBar) * 140, 4);
                  const sellH = Math.max((s.sellAmt / maxBar) * 140, 4);
                  return (
                    <div key={s.symbol} className="flex flex-col items-center" style={{ width: "8%", minWidth: 28 }}>
                      <div className="flex items-end gap-0.5" style={{ height: 140, width: "100%" }}>
                        <div className="rounded-t-md bg-up" style={{ height: buyH, width: "46%" }} />
                        <div className="rounded-t-md bg-down" style={{ height: sellH, width: "46%" }} />
                      </div>
                      <div className="mt-1 w-full truncate text-center text-[9px] font-semibold text-muted">{s.symbol.replace(/\d+/g, "")}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-up" /> Buy</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-down" /> Sell</span>
                <span className="ml-auto">Net: <b className={data.totals.netAmt >= 0 ? "text-up" : "text-down"}>{data.totals.netAmt >= 0 ? "+" : ""}{compact(data.totals.netAmt)}</b></span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-base font-bold">📄 Summary</h3>
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-2 p-3">
                <SummaryRow label="Total Buy" value={compact(data.totals.buyAmt)} color="text-up" />
                <SummaryRow label="Total Sell" value={compact(data.totals.sellAmt)} color="text-down" />
                <SummaryRow label="Net Amount" value={`${data.totals.netAmt >= 0 ? "+" : ""}${compact(data.totals.netAmt)}`} color={data.totals.netAmt >= 0 ? "text-up" : "text-down"} />
                <SummaryRow label="Stocks" value={String(data.stocks.length)} color="text-primary" />
                <SummaryRow label="Buy Ratio" value={`${buyRatio.toFixed(1)}%`} color="text-purple-600" />
              </div>
            </div>
          </div>
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
