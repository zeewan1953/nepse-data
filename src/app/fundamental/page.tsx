"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

type CompanyFundamental = {
  symbol: string;
  company_name: string;
  sector: string | null;
  eps: number | null;
  pe_ratio: number | null;
  paid_up_capital: number | null;
  net_profit: number | null;
  q1_growth_pct: number | null;
  q2_growth_pct: number | null;
  q3_growth_pct: number | null;
  q4_growth_pct: number | null;
  book_value: number | null;
  dividend_pct: number | null;
  market_cap: number | null;
  shares_outstanding: number | null;
  roe: number | null;
  pbv: number | null;
  debt_equity: number | null;
  fifty_two_week_range: string | null;
  last_updated: string;
  source: string;
  bonus_pct: number | null;
  right_share_pct: number | null;
  avg_30day_volume: number | null;
  last_traded_on: string | null;
  market_price: number | null;
  change_pct: number | null;
  year_yield: number | null;
  avg_120day: number | null;
  eps_fy: string | null;
  eps_quarter: number | null;
};

type CompanyNews = {
  id: number;
  symbol: string;
  headline: string;
  published_at: string;
  url: string | null;
  source: string;
};

type SortKey =
  | "symbol" | "company_name" | "sector" | "eps" | "pe_ratio"
  | "paid_up_capital" | "book_value" | "dividend_pct" | "market_cap"
  | "last_updated";

const SORTABLE: SortKey[] = [
  "symbol", "company_name", "sector", "eps", "pe_ratio",
  "paid_up_capital", "book_value", "dividend_pct", "market_cap",
];

const SORT_LABELS: Record<string, string> = {
  symbol: "Symbol", company_name: "Name", sector: "Sector",
  eps: "EPS", pe_ratio: "P/E", paid_up_capital: "Paid-Up Cap",
  book_value: "Book Value", dividend_pct: "Div%", market_cap: "Mkt Cap",
};

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

function npr(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ─── Search View ──────────────────────────────────────────────────────────

function SearchView({ onSelect }: { onSelect: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CompanyFundamental[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 1) { setResults([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/company-search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setResults(d.results || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [q]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
        <span className="text-muted">🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Type company name or symbol..."
          className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none" />
        {q && <button onClick={() => setQ("")} className="text-xs text-muted hover:text-foreground">✕</button>}
      </div>

      {loading && <div className="text-center text-xs text-muted">Searching...</div>}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid gap-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((r) => (
            <button key={r.symbol} onClick={() => onSelect(r.symbol)}
              className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left hover:bg-surface-2/80 hover:ring-1 hover:ring-primary transition">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{r.symbol}</div>
                <div className="truncate text-[10px] text-muted">{r.company_name}</div>
                {r.sector && <div className="truncate text-[9px] text-muted/60">{r.sector}</div>}
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                {r.pe_ratio !== null ? `P/E ${r.pe_ratio.toFixed(1)}` : "\u2014"}
              </div>
            </button>
          ))}
        </div>
      )}

      {q.length >= 1 && !loading && results.length === 0 && (
        <div className="py-12 text-center text-xs text-muted">
          No companies match "{q}". Try a different search.
        </div>
      )}

      {q.length === 0 && (
        <div className="py-12 text-center">
          <div className="mb-2 text-3xl">🏢</div>
          <div className="text-sm text-muted">Search for any NEPSE-listed company by name or symbol</div>
          <div className="mt-1 text-xs text-muted/60">e.g. NABIL, Himalayan, 2080, etc.</div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────

function DetailPanel({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const [data, setData] = useState<{ fundamental: CompanyFundamental; news: CompanyNews[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/company-detail/${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [symbol]);

  if (loading) {
    return <div className="py-24 text-center text-xs text-muted">Loading...</div>;
  }

  if (!data?.fundamental) {
    return <div className="py-24 text-center text-xs text-muted">No data found for {symbol}</div>;
  }

  const f = data.fundamental;
  const maybeBadge = f.pe_ratio !== null && f.eps !== null ? (
    f.pe_ratio < 15 ? "bg-up-bg text-up" : f.pe_ratio < 25 ? "bg-amber-500/10 text-amber-600" : "bg-down-bg text-down"
  ) : "bg-surface-2 text-muted";
  const peLabel = f.pe_ratio !== null ? (f.pe_ratio < 15 ? "Undervalued" : f.pe_ratio < 25 ? "Fair" : "Overvalued") : "N/A";

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition">
        ← Back to search
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            {f.symbol}
            <span className="text-xs font-normal text-muted truncate">{f.company_name}</span>
          </h2>
          {f.sector && <div className="text-xs text-muted/70">{f.sector}</div>}
        </div>
        <div className="shrink-0">
          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${maybeBadge}`}>{peLabel}</span>
        </div>
      </div>

      {/* Price info */}
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-bold text-foreground">{f.market_price !== null ? `Rs ${f.market_price.toLocaleString()}` : "\u2014"}</span>
        {f.change_pct !== null && (
          <span className={`text-sm font-semibold ${f.change_pct >= 0 ? "text-up" : "text-down"}`}>
            {f.change_pct >= 0 ? "+" : ""}{f.change_pct.toFixed(2)}%
          </span>
        )}
        {f.last_traded_on && <span className="text-[10px] text-muted/60">Last: {f.last_traded_on}</span>}
      </div>

      {/* Key metrics grid — full MeroLagani detail */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="EPS" value={f.eps !== null ? `Rs ${f.eps.toFixed(2)}` : "\u2014"} color="blue" />
        <MetricCard label="P/E Ratio" value={f.pe_ratio !== null ? f.pe_ratio.toFixed(2) : "\u2014"} color="purple" />
        <MetricCard label="Book Value" value={f.book_value !== null ? `Rs ${f.book_value.toFixed(2)}` : "\u2014"} color="green" />
        <MetricCard label="P/BV" value={f.pbv !== null ? f.pbv.toFixed(2) : "\u2014"} color="blue" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Market Cap" value={f.market_cap !== null ? fmt(f.market_cap) : "\u2014"} color="purple" />
        <MetricCard label="Paid-Up Capital" value={f.paid_up_capital !== null ? fmt(f.paid_up_capital) : "\u2014"} color="blue" />
        <MetricCard label="Shares Out." value={f.shares_outstanding !== null ? fmt(f.shares_outstanding) : "\u2014"} color="green" />
        <MetricCard label="Dividend" value={f.dividend_pct !== null ? `${f.dividend_pct}%` : "\u2014"} color={f.dividend_pct !== null && f.dividend_pct >= 10 ? "green" : "orange"} />
      </div>

      {/* Bonus / Right / Volume */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Bonus %" value={f.bonus_pct !== null ? `${f.bonus_pct}%` : "\u2014"} color="green" />
        <MetricCard label="Right Share %" value={f.right_share_pct !== null ? `${f.right_share_pct}%` : "\u2014"} color="orange" />
        <MetricCard label="30D Avg Vol" value={f.avg_30day_volume !== null ? Number(f.avg_30day_volume).toLocaleString() : "\u2014"} color="blue" />
        <MetricCard label="1Y Yield" value={f.year_yield !== null ? `${f.year_yield.toFixed(2)}%` : "\u2014"} color="green" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="120D Avg" value={f.avg_120day !== null ? f.avg_120day.toLocaleString() : "\u2014"} color="purple" />
        {f.fifty_two_week_range && <MetricCard label="52W Range" value={f.fifty_two_week_range} color="orange" />}
      </div>

      {/* Quarterly EPS from MeroLagani */}
      {f.eps_fy && f.eps_quarter && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">
            Quarterly EPS (FY {f.eps_fy} · Current: Q{f.eps_quarter})
          </div>
          <div className="grid grid-cols-4 gap-2">
            <QtrBox label="Q1" value={f.q1_growth_pct} />
            <QtrBox label="Q2" value={f.q2_growth_pct} />
            <QtrBox label="Q3" value={f.q3_growth_pct} />
            <QtrBox label="Q4" value={f.q4_growth_pct} />
          </div>
        </div>
      )}

      {/* 52W Range + Source (duplicate for backward compat) */}
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {f.fifty_two_week_range && <span>52W Range: {f.fifty_two_week_range}</span>}
        <span className="text-muted/60">Updated: {f.last_updated}</span>
        <span className="text-muted/60">Source: {f.source}</span>
      </div>

      {/* News */}
      {data.news.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">Latest News</div>
          <div className="space-y-1.5">
            {data.news.slice(0, 5).map((n) => (
              <div key={n.id} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                <div className="text-xs font-medium text-foreground">{n.headline}</div>
                <div className="mt-0.5 text-[9px] text-muted/60">{n.published_at}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "purple" | "orange" }) {
  const colorClass = { green: "text-up", red: "text-down", blue: "text-primary", purple: "text-purple-600", orange: "text-amber-600" }[color];
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-sm font-bold ${colorClass} tabular-nums`}>{value}</div>
    </div>
  );
}

function QtrBox({ label, value }: { label: string; value: number | null }) {
  const colored = value !== null ? (value >= 0 ? "text-up" : "text-down") : "text-muted";
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[9px] font-semibold text-muted">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${colored}`}>
        {value !== null ? `Rs ${value.toFixed(2)}` : "\u2014"}
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────

function TableView({ searchQuery }: { searchQuery?: string }) {
  const [rows, setRows] = useState<CompanyFundamental[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tableQ, setTableQ] = useState(searchQuery || "");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, dir, page: String(page) });
    const url = `/api/companies?${params}`;
    try {
      const res = await fetch(url);
      const d = await res.json();
      setRows(d.rows || []);
      setTotal(d.total || 0);
    } catch {}
    setLoading(false);
  }, [sort, dir, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSort = (col: SortKey) => {
    if (sort === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir("asc"); }
    setPage(1);
  };

  const filtered = tableQ
    ? rows.filter((r) => r.symbol.toLowerCase().includes(tableQ.toLowerCase()) || r.company_name.toLowerCase().includes(tableQ.toLowerCase()))
    : rows;

  const totalPages = Math.ceil(total / 100);

  // Detail view
  if (selectedSymbol) {
    return <DetailPanel symbol={selectedSymbol} onBack={() => setSelectedSymbol(null)} />;
  }

  return (
    <div className="space-y-3">
      {/* Search inside table */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
        <span className="text-muted">🔍</span>
        <input value={tableQ} onChange={(e) => setTableQ(e.target.value)}
          placeholder="Filter table by symbol or name..."
          className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none" />
        {tableQ && <button onClick={() => setTableQ("")} className="text-xs text-muted hover:text-foreground">✕</button>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-muted">
            <tr>
              {SORTABLE.map((col) => (
                <th key={col} onClick={() => toggleSort(col)}
                  className="cursor-pointer select-none px-3 py-2.5 text-left font-semibold hover:text-foreground transition whitespace-nowrap">
                  {SORT_LABELS[col] || col}
                  {sort === col && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.symbol} onClick={() => setSelectedSymbol(r.symbol)}
                className="cursor-pointer transition hover:bg-surface-2">
                <td className="px-3 py-2.5 font-bold text-foreground">{r.symbol}</td>
                <td className="px-3 py-2.5 text-muted max-w-[200px] truncate">{r.company_name}</td>
                <td className="px-3 py-2.5 text-muted/70">{r.sector || "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.eps !== null ? r.eps.toFixed(2) : "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.pe_ratio !== null ? r.pe_ratio.toFixed(2) : "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.paid_up_capital !== null ? fmt(r.paid_up_capital) : "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.book_value !== null ? r.book_value.toFixed(2) : "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.dividend_pct !== null ? `${r.dividend_pct}%` : "\u2014"}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground">{r.market_cap !== null ? fmt(r.market_cap) : "\u2014"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-muted">No companies found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!tableQ && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground disabled:opacity-30 transition">
            ← Prev
          </button>
          <span className="text-xs text-muted">Page {page} of {totalPages} ({total} companies)</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground disabled:opacity-30 transition">
            Next →
          </button>
        </div>
      )}

      {loading && <div className="text-center text-xs text-muted">Loading...</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function FundamentalPage() {
  const [view, setView] = useState<"search" | "table">("search");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
          <span className="text-primary">📊</span> Company Fundamentals
        </h1>
      </div>

      {/* View switcher */}
      <div className="flex gap-1 rounded-full border border-border bg-surface-2 p-1 w-fit">
        <button onClick={() => setView("search")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${view === "search" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
          🔍 Search
        </button>
        <button onClick={() => setView("table")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${view === "table" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
          📋 All Companies
        </button>
      </div>

      {/* Content */}
      {view === "search" ? (
        selectedSymbol ? (
          <DetailPanel symbol={selectedSymbol} onBack={() => setSelectedSymbol(null)} />
        ) : (
          <SearchView onSelect={(s) => setSelectedSymbol(s)} />
        )
      ) : (
        <TableView />
      )}
    </div>
  );
}
