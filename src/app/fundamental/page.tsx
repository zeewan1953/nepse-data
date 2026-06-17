"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { STOCKS } from "@/lib/fundamentalData";
import { enriched, stars, type EnrichedStock } from "@/lib/fundamentalCalc";
import { usePoll } from "@/lib/useLive";
import { npr, pct, changeClass, compact } from "@/lib/format";

const FILTERS = ["All", "BUY", "HOLD", "SELL"] as const;

type LiveRow = {
  symbol: string;
  name: string;
  securityName?: string;
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
  netWorth: number;
  totalDebt: number;
  netProfit: number;
  revenue: number;
  roe: number;
  debtEquity: number;
  yearYield?: string;
  avg120?: string;
  totalPaidup?: string;
  paidupValue?: string;
  listedShares?: string;
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
  const live = usePoll<{ data: LiveRow[]; count: number; source: string }>("/api/stocks", 3_000);

  const stocks = useMemo<MergedStock[]>(() => {
    const liveMap = new Map<string, LiveRow>();
    (live.data?.data ?? []).forEach((row) => liveMap.set(row.symbol, row));

    const merged: MergedStock[] = hardcoded.map((s) => {
      const liveRow = liveMap.get(s.symbol);
      return {
        ...s, hasFundamental: true,
        price: liveRow?.lastTradedPrice ?? s.price,
        change: liveRow?.percentageChange ?? s.change,
        liveName: liveRow?.name || liveRow?.securityName || s.name,
        liveVolume: liveRow?.totalTradeQuantity ?? 0,
      };
    });

    (live.data?.data ?? []).forEach((row) => {
      if (merged.some((s) => s.symbol === row.symbol)) return;
      merged.push({
        ...enriched({
          id: `NEPSE-${row.symbol}`, symbol: row.symbol, name: row.name || row.securityName || row.symbol,
          sector: "Other", price: row.lastTradedPrice, change: row.percentageChange,
          volume: formatVolume(row.totalTradeQuantity),
          current: { pe: 0, eps: 0, shares: "-", roe: 0, debt: "-", revenue: "-", profit: "-" },
          threeYear: { years: [], revenue: [], profit: [], eps: [], roe: [], debt: [], dividend: [] },
          ratios: { pb: 0, debtEquity: 0, currentRatio: 0, beta: 0, peg: 0 },
          holdings: { promoter: "-", fii: "-", dii: "-", public: "-", longTerm: "-" },
          quarterly: { q1: 0, q1Change: 0, q2: 0, q2Change: 0, q3: 0, q3Change: 0, q4: 0, q4Change: 0 },
          news: "-",
        }),
        hasFundamental: false, liveName: row.name || row.securityName || row.symbol, liveVolume: row.totalTradeQuantity,
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
  const [selected, setSelected] = useState<string>(data[0]?.symbol ?? "");
  const [tab, setTab] = useState<"overview" | "3year">("overview");
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
      const matchQ = !q || s.symbol.toLowerCase().includes(query) || (s.name || "").toLowerCase().includes(query) || (s.liveName || "").toLowerCase().includes(query) || (s.id || "").toLowerCase().includes(query);
      const matchFilter = filter === "All" || (s.hasFundamental && s.verdict.label === filter);
      return matchQ && matchFilter;
    });
  }, [data, q, filter]);

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

      </div>



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

      {/* Main grid: left = stock list, right = detail */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left column: Top 10 + search results */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Search results — shown first when typing */}
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
                  {externalLoading && <span className="text-[9px] text-muted">loading…</span>}
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface-2 p-1">
                {(["overview", "3year"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${tab === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
                    {t === "overview" ? "Overview" : "3-Year"}
                  </button>
                ))}
              </div>

              {!selectedStock.hasFundamental ? (
                <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
                  <div className="mb-2 text-2xl">📡</div>
                  <div className="text-sm font-bold text-foreground">Live data only</div>
                  <div className="text-xs text-muted">3-year analysis not available for {selectedStock.symbol}</div>
                </div>
              ) : tab === "overview" ? (
                <OverviewTab stock={selectedStock} external={external} />
              ) : (
                <ThreeYearTab stock={selectedStock} external={external} />
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
        <QuickStat label="ROE" value={external?.roe ? `${external.roe.toFixed(1)}%` : stock.current.roe ? `${stock.current.roe}%` : "-"} />
        <QuickStat label="Volume" value={stock.liveVolume ? formatVolume(stock.liveVolume) : stock.volume} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {external?.marketCap && <DeepItem label="Market Cap" value={compact(parseFloat(external.marketCap.replace(/,/g, "")))} color="purple" />}
        <DeepItem label="Shares" value={external?.sharesOutstanding ? compact(parseFloat(external.sharesOutstanding.replace(/,/g, ""))) : stock.current.shares} color="blue" />
        {external?.bookValue ? <DeepItem label="Book Value" value={external.bookValue.toFixed(2)} color="green" /> : null}
        {external?.pbv ? <DeepItem label="P/BV" value={external.pbv.toFixed(2)} color="blue" /> :
          <DeepItem label="P/B" value={stock.ratios.pb ? stock.ratios.pb.toFixed(1) : "-"} color="blue" />}
        {external?.yearYield && <DeepItem label="1Y Yield" value={external.yearYield} color="green" />}
        {external?.avg120 && <DeepItem label="120D Avg" value={external.avg120} color="blue" />}
        {external?.weekRange && <DeepItem label="52W Range" value={external.weekRange} color="orange" />}
        <DeepItem label="Revenue" value={external?.revenue ? `${npr(external.revenue)}` : stock.current.revenue} color="blue" />
        <DeepItem label="Net Profit" value={external?.netProfit ? `${npr(external.netProfit)}` : stock.current.profit} color="green" />
        <DeepItem label="Total Debt" value={external?.totalDebt ? `${npr(external.totalDebt)}` : stock.current.debt} color="red" />
        <DeepItem label="Net Worth" value={external?.netWorth ? `${compact(external.netWorth)}` : "-"} color="purple" />
        {external?.debtEquity ? <DeepItem label="D/E Ratio" value={external.debtEquity.toFixed(2)} color="orange" /> : null}
      </div>

      {external && external.dividends.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-xs font-semibold text-muted">📅 Dividend History</div>
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

function ThreeYearTab({ stock, external }: { stock: MergedStock; external: ExternalFundamental | null }) {
  const fy = stock.threeYear;
  const hasReal = external && (external.revenue > 0 || external.netProfit > 0 || external.eps > 0);
  
  if (!fy.years.length && !hasReal) return <div className="py-6 text-center text-xs text-muted">No financial data available.</div>;
  
  // Use real MeroLagani data for the latest year if available
  const latestRevenue = hasReal ? external.revenue : (fy.revenue[fy.revenue.length - 1] || 0);
  const latestProfit = hasReal ? external.netProfit : (fy.profit[fy.profit.length - 1] || 0);
  const latestEps = hasReal ? external.eps : (fy.eps[fy.eps.length - 1] || 0);
  const latestRoe = hasReal ? external.roe : (fy.roe[fy.roe.length - 1] || 0);
  const latestDebt = hasReal ? external.totalDebt : (fy.debt[fy.debt.length - 1] || 0);
  const latestNetWorth = hasReal ? external.netWorth : 0;
  const latestDebtEquity = hasReal ? external.debtEquity : 0;
  const latestDividend = external?.dividends?.[0]?.value || (fy.dividend[fy.dividend.length - 1] || 0);
  
  return (
    <>
      {/* Data Source Badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${hasReal ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
          {hasReal ? "✅ Audited Data" : "📊 Sample Data"}
        </span>
        {external?.sector && <span className="rounded-full bg-primary-bg px-3 py-1 text-[10px] font-semibold text-primary">{external.sector}</span>}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <ScoreCard label="Health Score" score={stock.healthScore} />
        <ScoreCard label="Growth Score" score={stock.growthScore} />
      </div>
      
      {/* Real Audited Financial Metrics */}
      <div className="mb-3 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              {hasReal && <th className="px-3 py-2 text-right font-semibold">Source</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Revenue</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{latestRevenue > 0 ? `Rs. ${npr(latestRevenue)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Net Profit</td>
              <td className="px-3 py-2 text-right font-bold text-up">{latestProfit > 0 ? `Rs. ${npr(latestProfit)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">EPS</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{latestEps > 0 ? `Rs. ${latestEps.toFixed(2)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">ROE (%)</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{latestRoe > 0 ? `${latestRoe.toFixed(1)}%` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Net Worth</td>
              <td className="px-3 py-2 text-right font-bold text-primary">{latestNetWorth > 0 ? `Rs. ${compact(latestNetWorth)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Total Debt</td>
              <td className="px-3 py-2 text-right font-bold text-down">{latestDebt > 0 ? `Rs. ${npr(latestDebt)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">D/E Ratio</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{latestDebtEquity > 0 ? latestDebtEquity.toFixed(2) : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Calculated</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Dividend</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{latestDividend > 0 ? `${latestDividend}%` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">P/E Ratio</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{external?.pe ? external.pe.toFixed(2) : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
            <tr className="hover:bg-surface-2">
              <td className="px-3 py-2 font-medium">Book Value</td>
              <td className="px-3 py-2 text-right font-bold text-foreground">{external?.bookValue ? `Rs. ${external.bookValue.toFixed(2)}` : "-"}</td>
              {hasReal && <td className="px-3 py-2 text-right text-[10px] text-muted">Audited</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* CAGR Progress Bars - only show if we have sample data */}
      {fy.years.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="mb-1 text-[10px] font-semibold text-muted">Growth Metrics {hasReal ? "(Current Year)" : "(Sample Data)"}</div>
          <ProgressBar label="Revenue CAGR" value={stock.revenueCAGR} />
          <ProgressBar label="Profit CAGR" value={stock.profitCAGR} />
          <ProgressBar label="EPS CAGR" value={stock.epsCAGR} />
          <ProgressBar label="Avg ROE" value={stock.avgROE} />
          <ProgressBar label="Debt Change" value={stock.debtChange} negativeIsGood />
          <ProgressBar label="Dividend Growth" value={stock.dividendGrowth} />
        </div>
      )}

      {/* Historical Table from Sample Data */}
      {fy.years.length > 0 && !hasReal && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <div className="mb-1 px-2 pt-2 text-[10px] font-semibold text-muted">Sample 3-Year Data (Real data loading...)</div>
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
      )}

      {/* Dividend History from MeroLagani */}
      {external && external.dividends.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold text-muted">📅 Dividend History (Audited)</div>
          <div className="flex flex-wrap gap-1.5">
            {external.dividends.map((d) => (
              <span key={d.fiscalYear} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-foreground">
                FY {d.fiscalYear}: {d.value}%
              </span>
            ))}
          </div>
        </div>
      )}
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
