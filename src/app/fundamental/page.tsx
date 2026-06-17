"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STOCKS } from "@/lib/fundamentalData";
import { enriched, stars, type EnrichedStock } from "@/lib/fundamentalCalc";
import { npr, pct, changeClass } from "@/lib/format";

const FILTERS = ["All", "BUY", "HOLD", "SELL"] as const;
const SECTORS = ["All", "Banking", "Energy", "Finance", "Healthcare", "Oil & Gas"] as const;

export default function FundamentalPage() {
  const data = useMemo(() => STOCKS.map(enriched), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sector, setSector] = useState<(typeof SECTORS)[number]>("All");
  const [selected, setSelected] = useState<string>(data[0].symbol);
  const [tab, setTab] = useState<"overview" | "5year">("overview");

  const filtered = useMemo(() => {
    return data.filter((s) => {
      const matchQ = !q || s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase());
      const matchFilter = filter === "All" || s.verdict.label === filter;
      const matchSector = sector === "All" || s.sector === sector;
      return matchQ && matchFilter && matchSector;
    });
  }, [data, q, filter, sector]);

  const top10 = useMemo(() => [...data].sort((a, b) => b.growthScore - a.growthScore).slice(0, 10), [data]);
  const selectedStock = useMemo(() => data.find((s) => s.symbol === selected) ?? data[0], [data, selected]);

  return (
    <div className="mx-auto max-w-[540px] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <span className="text-primary">📊</span> NEPSE Deep Fundamental
        </h1>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="h-2 w-2 rounded-full bg-up animate-pulse" />
          Offline
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
        <span className="text-muted">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol, name, or ID…"
          className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none"
        />
        {q && <button onClick={() => setQ("")} className="text-xs text-muted hover:text-foreground">✕</button>}
      </div>

      {/* Verdict filters */}
      <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-primary text-white" : "text-muted hover:bg-surface-2"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Sector filters */}
      <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setSector(s)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              sector === s ? "bg-primary text-white" : "text-muted hover:bg-surface-2"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Top 10 Panel */}
      <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <span className="text-amber-500">⭐</span> Top 10 by Growth Score
          </h3>
          <span className="text-xs font-semibold text-primary">{filtered.length} results</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {top10.map((s, idx) => {
            const rankClass = idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-600" : "bg-primary";
            const isSelected = selectedStock.symbol === s.symbol;
            return (
              <button
                key={s.symbol}
                onClick={() => { setSelected(s.symbol); setTab("overview"); }}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition ${
                  isSelected ? "border-primary bg-surface-2" : "border-border bg-surface-2 hover:bg-surface-2/80"
                }`}
              >
                <span className={`grid h-5.5 w-5.5 place-items-center rounded-full text-[10px] font-bold text-white ${rankClass}`}>{idx + 1}</span>
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

      {/* Detail Card */}
      {selectedStock && (
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Link href={`/stock/${selectedStock.symbol}`} className="hover:underline">{selectedStock.symbol}</Link>
                <span className="text-xs font-normal text-muted">{selectedStock.id}</span>
              </h3>
              <p className="text-xs text-muted">{selectedStock.name}</p>
            </div>
            <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">{selectedStock.sector}</span>
          </div>

          {/* Tabs */}
          <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface-2 p-1">
            {(["overview", "5year"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${
                  tab === t ? "bg-primary text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {t === "overview" ? "Overview" : "5-Year"}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <OverviewTab stock={selectedStock} />
          ) : (
            <FiveYearTab stock={selectedStock} />
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab({ stock }: { stock: EnrichedStock }) {
  const vColor = stock.verdict.label === "BUY" ? "bg-up text-white" : stock.verdict.label === "HOLD" ? "bg-amber-500 text-white" : "bg-down text-white";
  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[26px] font-bold text-foreground">{npr(stock.price)}</span>
        <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${changeClass(stock.change)}`}>
          {stock.change > 0 ? "+" : ""}{pct(stock.change)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        <QuickStat label="P/E" value={stock.current.pe.toFixed(1)} />
        <QuickStat label="EPS" value={stock.current.eps.toFixed(1)} />
        <QuickStat label="ROE" value={`${stock.current.roe}%`} />
        <QuickStat label="Volume" value={stock.volume} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <DeepItem label="Revenue" value={stock.current.revenue} color="blue" />
        <DeepItem label="Net Profit" value={stock.current.profit} color="green" />
        <DeepItem label="Total Debt" value={stock.current.debt} color="red" />
        <DeepItem label="P/B" value={stock.ratios.pb.toFixed(1)} color="blue" />
        <DeepItem label="Debt/Eq" value={stock.ratios.debtEquity.toFixed(2)} color="orange" />
        <DeepItem label="Current Ratio" value={stock.ratios.currentRatio.toFixed(2)} color="blue" />
        <DeepItem label="Beta" value={stock.ratios.beta.toFixed(1)} color="purple" />
        <DeepItem label="PEG" value={stock.ratios.peg.toFixed(1)} color="purple" />
      </div>

      <div className="mb-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <span>📅</span> Quarterly EPS
        </div>
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

function FiveYearTab({ stock }: { stock: EnrichedStock }) {
  const fy = stock.fiveYear;
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
            <tr>
              <th className="px-2 py-2 text-left">Year</th>
              {fy.years.map((y) => <th key={y} className="px-2 py-2 text-right">{y}</th>)}
            </tr>
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
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-3 py-2">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span className={`text-sm font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function QuarterItem({ label, value, change }: { label: string; value: number; change: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[9px] font-semibold text-muted">{label}</div>
      <div className="text-[13px] font-bold text-foreground">{value.toFixed(1)}</div>
      <div className={`text-[9px] font-semibold ${change >= 0 ? "text-up" : "text-down"}`}>{change > 0 ? "+" : ""}{change}%</div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
      {label} <strong>{value}</strong>
    </span>
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
  const pct = Math.min(100, Math.max(0, (negativeIsGood ? Math.max(0, -value) : value) / 30 * 100));
  const color = negativeIsGood
    ? value <= 0 ? "bg-up" : "bg-down"
    : value >= 15 ? "bg-up" : value >= 8 ? "bg-amber-500" : "bg-down";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-bold text-foreground">{value > 0 ? "+" : ""}{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
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
