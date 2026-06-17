"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { STOCKS } from "@/lib/fundamentalData";
import { enriched, stars, type EnrichedStock } from "@/lib/fundamentalCalc";
import { usePoll } from "@/lib/useLive";
import { npr, pct, changeClass } from "@/lib/format";

const FILTERS = ["All", "BUY", "HOLD", "SELL"] as const;
const SECTORS = ["All", "Banking", "Energy", "Finance", "Healthcare", "Oil & Gas", "Other"] as const;

type LiveRow = {
  symbol: string;
  securityName: string;
  lastTradedPrice: number;
  percentageChange: number;
  totalTradeQuantity: number;
  lastUpdatedDateTime?: string;
};

type MergedStock = EnrichedStock & {
  hasFundamental: boolean;
  liveName: string;
  liveVolume: number;
};

type ExternalFundamental = {
  symbol: string;
  name: string;
  sector: string;
  sharesOutstanding: string;
  marketPrice: number;
  change: number;
  eps: number;
  pe: number;
  bookValue: number;
  pbv: number;
  marketCap: string;
  weekRange: string;
  dividends: { fiscalYear: string; value: number }[];
  source: string;
  error?: string;
};

function formatVolume(n: number): string {
  if (!n) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toString();
}

function useMergedStocks(): { stocks: MergedStock[]; loading: boolean; error: string | null } {
  const hardcoded = useMemo(() => STOCKS.map(enriched), []);
  const live = usePoll<{ data: LiveRow[]; count: number; source: string }>("/api/live", 3_000);

  const stocks = useMemo<MergedStock[]>(() => {
    const liveMap = new Map<string, LiveRow>();
    (live.data?.data ?? []).forEach((row) => liveMap.set(row.symbol, row));

    const merged: MergedStock[] = hardcoded.map((s) => {
      const liveRow = liveMap.get(s.symbol);
      return {
        ...s, hasFundamental: true,
        price: liveRow?.lastTradedPrice ?? s.price,
        change: liveRow?.percentageChange ?? s.change,
        liveName: liveRow?.securityName ?? s.name,
        liveVolume: liveRow?.totalTradeQuantity ?? 0,
      };
    });

    (live.data?.data ?? []).forEach((row) => {
      if (merged.some((s) => s.symbol === row.symbol)) return;
      merged.push({
        ...enriched({
          id: `NEPSE-${row.symbol}`, symbol: row.symbol, name: row.securityName,
          sector: "Other", price: row.lastTradedPrice, change: row.percentageChange,
          volume: formatVolume(row.totalTradeQuantity),
          current: { pe: 0, eps: 0, shares: "-", roe: 0, debt: "-", revenue: "-", profit: "-" },
          fiveYear: { years: [], revenue: [], profit: [], eps: [], roe: [], debt: [], dividend: [] },
          ratios: { pb: 0, debtEquity: 0, currentRatio: 0, beta: 0, peg: 0 },
          holdings: { promoter: "-", fii: "-", dii: "-", public: "-", longTerm: "-" },
          quarterly: { q1: 0, q1Change: 0, q2: 0, q2Change: 0, q3: 0, q3Change: 0, q4: 0, q4Change: 0 },
          news: "-",
        }),
        hasFundamental: false, liveName: row.securityName, liveVolume: row.totalTradeQuantity,
      });
    });

    return merged.sort((a, b) => b.growthScore - a.growthScore);
  }, [hardcoded, live.data]);

  return { stocks, loading: live.loading, error: live.error };
}

export default function FundamentalPage() {
  const { stocks: data, loading, error } = useMergedStocks();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sector, setSector] = useState<(typeof SECTORS)[number]>("All");
  const [selected, setSelected] = useState<string>(data[0]?.symbol ?? "");
  const [tab, setTab] = useState<"overview" | "5year">("overview");
  const [external, setExternal] = useState<ExternalFundamental | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setExternalLoading(true);
    fetch(`/api/fundamental-external/${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!alive) return;
        if (res.ok) setExternal(json as ExternalFundamental);
        else setExternal(null);
      }).catch(() => setExternal(null))
      .finally(() => { if (alive) setExternalLoading(false); });
    return () => { alive = false; };
  }, [selected]);

  const filtered = useMemo(() => {
    return data.filter((s) => {
      const query = q.toLowerCase();
      const matchQ = !q || s.symbol.toLowerCase().includes(query) || s.name.toLowerCase().includes(query) || s.liveName.toLowerCase().includes(query) || s.id.toLowerCase().includes(query);
      const matchFilter = filter === "All" || (s.hasFundamental && s.verdict.label === filter);
      const matchSector = sector === "All" || s.sector === sector;
      return matchQ && matchFilter && matchSector;
    });
  }, [data, q, filter, sector]);

  const top10 = useMemo(() => data.filter((s) => s.hasFundamental).sort((a, b) => b.growthScore - a.growthScore).slice(0, 10), [data]);
  const selectedStock = useMemo(() => data.find((s) => s.symbol === selected) ?? data[0], [data, selected]);

  if (loading && !data.length) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">Loading market data…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
          <span className="text-primary">📊</span> NEPSE Deep Fundamental
        </h1>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className={`h-2 w-2 rounded-full animate-pulse ${error ? "bg-down" : "bg-up"}`} />
          {error ? "API Error" : loading ? "Loading…" : "Live"}
          <span className="hidden sm:inline">· auto 3s</span>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-down bg-down/10 px-4 py-2 text-xs text-down">{error} — showing cached data.</div>}

      {/* Search + Filters row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
          <span className="text-muted">🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol or company name…"
            className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none" />
          {q && <button onClick={() => setQ("")} className="text-xs text-muted hover:text-foreground">✕</button>}
        </div>
        <div className="flex shrink-0 gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition ${filter === f ? "bg-primary text-white" : "border border-border bg-surface text-muted hover:bg-surface-2"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Sector filters */}
      <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {SECTORS.map((s) => (
          <button key={s} onClick={() => setSector(s)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${sector === s ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Main grid: left = stock list, right = detail */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left column: Top 10 + search results */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Top 10 */}
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="text-amber-500">⭐</span> Top 10 by Growth
              </h3>
              <span className="text-xs font-semibold text-muted">{filtered.length} results</span>
            </div>
            <div className="grid gap-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
              {top10.map((s, idx) => {
                const rankClass = idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-600" : "bg-primary";
                const isSelected = selectedStock?.symbol === s.symbol;
                return (
                  <button key={s.symbol} onClick={() => { setSelected(s.symbol); setTab("overview"); }}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${isSelected ? "border-primary bg-surface-2 ring-1 ring-primary" : "border-border bg-surface-2 hover:bg-surface-2/80"}`}>
                    <span className={`grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${rankClass}`}>{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-foreground">{s.symbol}</div>
                      <div className="truncate text-[10px] text-muted">{s.sector}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">{npr(s.price)}</div>
                      <div className={`text-[11px] font-semibold ${changeClass(s.change)}`}>{s.change > 0 ? "+" : ""}{pct(s.change)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search results */}
          {q && (
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-bold text-foreground">Search Results — <span className="text-muted font-normal">{filtered.length} found</span></h3>
              <div className="grid gap-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, 30).map((s) => (
                  <button key={s.symbol} onClick={() => { setSelected(s.symbol); setQ(""); setTab("overview"); }}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-left hover:bg-surface-2/80">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{s.symbol}</div>
                      <div className="truncate text-[10px] text-muted">{s.hasFundamental ? s.name : s.liveName}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-foreground">{npr(s.price)}</div>
                      <div className={`text-[11px] font-semibold ${changeClass(s.change)}`}>{s.change > 0 ? "+" : ""}{pct(s.change)}</div>
                    </div>
                  </button>
                ))}
                {!filtered.length && <div className="col-span-full py-8 text-center text-xs text-muted">No stocks found.</div>}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Detail Card */}
        {selectedStock && (
          <div className="w-full lg:w-[400px] xl:w-[460px] shrink-0">
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <Link href={`/stock/${selectedStock.symbol}`} className="hover:underline">{selectedStock.symbol}</Link>
                    <span className="text-xs font-normal text-muted">{selectedStock.id}</span>
                  </h3>
                  <p className="truncate text-xs text-muted">{external?.name || (selectedStock.hasFundamental ? selectedStock.name : selectedStock.liveName)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">{external?.sector || selectedStock.sector}</span>
                  {external && <span className="text-[9px] text-muted">via {external.source}</span>}
                  {externalLoading && <span className="text-[9px] text-muted">loading…</span>}
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface-2 p-1">
                {(["overview", "5year"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${tab === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
                    {t === "overview" ? "Overview" : "5-Year"}
                  </button>
                ))}
              </div>

              {!selectedStock.hasFundamental ? (
                <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
                  <div className="mb-2 text-2xl">📡</div>
                  <div className="text-sm font-bold text-foreground">Live data only</div>
                  <div className="text-xs text-muted">5-year analysis not available for {selectedStock.symbol}</div>
                </div>
              ) : tab === "overview" ? (
                <OverviewTab stock={selectedStock} external={external} />
              ) : (
                <FiveYearTab stock={selectedStock} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ stock, external }: { stock: MergedStock; external: ExternalFundamental | null }) {
  const vColor = stock.verdict.label === "BUY" ? "bg-up text-white" : stock.verdict.label === "HOLD" ? "bg-amber-500 text-white" : "bg-down text-white";
  const price = external?.marketPrice || stock.price;
  const change = external?.change ?? stock.change;
  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[26px] font-bold text-foreground">{npr(price)}</span>
        <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${changeClass(change)}`}>
          {change > 0 ? "+" : ""}{pct(change)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <QuickStat label="P/E" value={external?.pe ? external.pe.toFixed(2) : stock.current.pe ? stock.current.pe.toFixed(1) : "-"} />
        <QuickStat label="EPS" value={external?.eps ? external.eps.toFixed(2) : stock.current.eps ? stock.current.eps.toFixed(1) : "-"} />
        <QuickStat label="ROE" value={stock.current.roe ? `${stock.current.roe}%` : "-"} />
        <QuickStat label="Volume" value={stock.liveVolume ? formatVolume(stock.liveVolume) : stock.volume} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {external?.marketCap && <DeepItem label="Market Cap" value={external.marketCap} color="purple" />}
        <DeepItem label="Shares" value={external?.sharesOutstanding || stock.current.shares} color="blue" />
        {external?.bookValue ? <DeepItem label="Book Value" value={external.bookValue.toFixed(2)} color="green" /> : null}
        {external?.pbv ? <DeepItem label="P/BV" value={external.pbv.toFixed(2)} color="blue" /> :
          <DeepItem label="P/B" value={stock.ratios.pb ? stock.ratios.pb.toFixed(1) : "-"} color="blue" />}
        <DeepItem label="Revenue" value={stock.current.revenue} color="blue" />
        <DeepItem label="Net Profit" value={stock.current.profit} color="green" />
        <DeepItem label="Total Debt" value={stock.current.debt} color="red" />
        {external?.weekRange && <DeepItem label="52W Range" value={external.weekRange} color="orange" />}
      </div>

      {external && external.dividends.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-xs font-semibold text-muted">📅 Dividend History (MeroLagani)</div>
          <div className="flex flex-wrap gap-1.5">
            {external.dividends.slice(0, 5).map((d) => (
              <span key={d.fiscalYear} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-foreground">
                FY {d.fiscalYear}: {d.value}%
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">📅 Quarterly EPS</div>
        <div className="grid grid-cols-4 gap-1.5">
          <QuarterItem label="Q1" value={stock.quarterly.q1} change={stock.quarterly.q1Change} />
          <QuarterItem label="Q2" value={stock.quarterly.q2} change={stock.quarterly.q2Change} />
          <QuarterItem label="Q3" value={stock.quarterly.q3} change={stock.quarterly.q3Change} />
          <QuarterItem label="Q4" value={stock.quarterly.q4} change={stock.quarterly.q4Change} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Pill label="Promoter" value={stock.holdings.promoter} />
        <Pill label="FII" value={stock.holdings.fii} />
        <Pill label="DII" value={stock.holdings.dii} />
        <Pill label="Public" value={stock.holdings.public} />
        <Pill label="Long Term" value={stock.holdings.longTerm} />
      </div>

      <div className={`rounded-2xl ${vColor} p-3 text-center`}>
        <div className="text-2xl">{stock.verdict.icon}</div>
        <div className="text-lg font-bold">{stock.verdict.label}</div>
        <div className="text-xs opacity-90">{stock.verdict.reason}</div>
      </div>
    </>
  );
}

function FiveYearTab({ stock }: { stock: MergedStock }) {
  const fy = stock.fiveYear;
  if (!fy.years.length) return <div className="py-6 text-center text-xs text-muted">No 5-year data available.</div>;
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <ScoreCard label="Health Score" score={stock.healthScore} />
        <ScoreCard label="Growth Score" score={stock.growthScore} />
      </div>
      <div className="mb-3 space-y-2">
        <ProgressBar label="Revenue CAGR" value={stock.revenueCAGR} />
        <ProgressBar label="Profit CAGR" value={stock.profitCAGR} />
        <ProgressBar label="EPS CAGR" value={stock.epsCAGR} />
        <ProgressBar label="Avg ROE" value={stock.avgROE} />
        <ProgressBar label="Debt Change" value={stock.debtChange} negativeIsGood />
        <ProgressBar label="Dividend Growth" value={stock.dividendGrowth} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-muted">
            <tr><th className="px-2 py-2 text-left">Year</th>{fy.years.map((y) => <th key={y} className="px-2 py-2 text-right">{y}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            <YearRow label="Revenue (Cr)" values={fy.revenue} />
            <YearRow label="Profit (Cr)" values={fy.profit} />
            <YearRow label="EPS" values={fy.eps} />
            <YearRow label="ROE (%)" values={fy.roe} suffix="%" />
            <YearRow label="Debt (Cr)" values={fy.debt} />
            <YearRow label="Dividend" values={fy.dividend} />
          </tbody>
        </table>
      </div>
    </>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[8px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function DeepItem({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "purple" | "orange" }) {
  const colorClass = { green: "text-up", red: "text-down", blue: "text-primary", purple: "text-purple-600", orange: "text-amber-600" }[color];
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span className={`text-sm font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function QuarterItem({ label, value, change }: { label: string; value: number; change: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[9px] font-semibold text-muted">{label}</div>
      <div className="text-[13px] font-bold text-foreground">{value ? value.toFixed(1) : "-"}</div>
      {value !== 0 && <div className={`text-[9px] font-semibold ${change >= 0 ? "text-up" : "text-down"}`}>{change > 0 ? "+" : ""}{change}%</div>}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">{label} <strong>{value}</strong></span>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? "text-up" : score >= 50 ? "text-amber-500" : "text-down";
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-3 text-center">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-muted">{stars(score)}</div>
    </div>
  );
}

function ProgressBar({ label, value, negativeIsGood }: { label: string; value: number; negativeIsGood?: boolean }) {
  const barPct = Math.min(100, Math.max(0, (negativeIsGood ? Math.max(0, -value) : value) / 30 * 100));
  const color = negativeIsGood ? (value <= 0 ? "bg-up" : "bg-down") : value >= 15 ? "bg-up" : value >= 8 ? "bg-amber-500" : "bg-down";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-bold text-foreground">{value > 0 ? "+" : ""}{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

function YearRow({ label, values, suffix = "" }: { label: string; values: number[]; suffix?: string }) {
  return (
    <tr className="hover:bg-surface-2">
      <td className="px-2 py-2 font-medium text-muted">{label}</td>
      {values.map((v, i) => <td key={i} className="px-2 py-2 text-right tabular-nums text-foreground">{v.toFixed(v < 10 ? 1 : 0)}{suffix}</td>)}
    </tr>
  );
}
