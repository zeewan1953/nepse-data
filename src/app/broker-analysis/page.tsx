"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { BrokerPerformanceSection } from "./broker-performance";
import { StockBrokerFlow } from "./StockBrokerFlow";
import { BrokerStockPanels } from "./BrokerStockPanels";
import { BrokerStockDetail } from "./BrokerStockDetail";

// ─── Types ──────────────────────────────────────────────────────────────────

type StockWiseItem = {
  symbol: string;
  ltp: number | null;
  changePercent: number | null;
  totalVolume: number;
  totalTurnover: number;
  tradeCount: number;
  estBuyVolume: number | null;
  estSellVolume: number | null;
  estNetVolume: number | null;
  cmf: number | null;
  mfi: number | null;
  volumeZScore: number | null;
  estimateMethod: string | null;
};

type StockWiseResp = {
  date: string;
  stocks: StockWiseItem[];
  source: "floorsheet";
  availableDates?: string[];
};

type BrokerDailyRecord = {
  tradeDate: string;
  purchaseAmt: number;
  sellAmt: number;
  netAmt: number;
  totalAmt: number;
};

type BrokerWiseResp = {
  brokerCode: string;
  brokerName: string;
  daysAvailable: number;
  history: BrokerDailyRecord[];
  totals: {
    buyAmount: number;
    sellAmount: number;
    netAmount: number;
    turnover: number;
  };
  currentStreak: { direction: "buy" | "sell"; length: number } | null;
  rollingNetFlow: number;
  source: "merolagani";
};

type BrokerOption = {
  broker: string;
  name: string;
};

type SortKey = "turnover" | "netEst" | "cmf";
type TimeRange = "1D" | "3D" | "1W" | "1M" | "3M";

// ─── Helpers ───────────────────────────────────────────────────────────────

const MDASH = "\u2014";

function npr(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return MDASH;
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return MDASH;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return MDASH;
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function cls(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "text-blue-500";
  return n > 0 ? "text-up" : "text-down";
}

const RANGE_LABELS: Record<TimeRange, string> = {
  "1D": "1D", "3D": "3D", "1W": "1W", "1M": "1M", "3M": "3M",
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "turnover", label: "Turnover" },
  { key: "netEst", label: "Est. Net" },
  { key: "cmf", label: "CMF" },
];

// ─── Stock Wise Table ──────────────────────────────────────────────────────

function StockWiseTab({ dateKey }: { dateKey: string }) {
  const [data, setData] = useState<StockWiseResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("turnover");
  const [query, setQuery] = useState("");

  const fetchWithDate = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // Empty date → API auto-selects the latest available trading day.
      const dateQ = date ? `date=${date}&` : "";
      const res = await fetch(`/api/stock-wise?${dateQ}sort=${sort}`);
      const d: StockWiseResp = await res.json();
      if (d.stocks && d.stocks.length > 0) {
        setData(d);
      } else if (d.availableDates && d.availableDates.length > 0 && d.availableDates[0] !== date) {
        // Retry with the latest available date
        const res2 = await fetch(`/api/stock-wise?date=${d.availableDates[0]}&sort=${sort}`);
        const d2: StockWiseResp = await res2.json();
        setData(d2);
      } else {
        setData(d);
      }
    } catch { setData(null); }
    setLoading(false);
  }, [sort]);

  useEffect(() => { fetchWithDate(dateKey); }, [dateKey, fetchWithDate]);

  const filtered = useMemo(() => {
    if (!data?.stocks) return [];
    if (!query.trim()) return data.stocks;
    const q = query.toLowerCase();
    return data.stocks.filter((s) => s.symbol.toLowerCase().includes(q));
  }, [data, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-sm text-muted">Loading stock data...</span>
      </div>
    );
  }

  if (!data || !data.stocks.length) {
    return (
      <div className="py-12 text-center">
        <div className="text-3xl mb-2">📊</div>
        <div className="text-sm text-muted">No floorsheet data available for {dateKey}.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol..."
          className="h-8 w-40 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
        />
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                sort === o.key ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] text-muted">
          {data.stocks.length} stocks &middot; {data.source}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
              <th className="sticky left-0 bg-surface px-2 py-2 text-left">Symbol</th>
              <th className="px-2 py-2 text-right">LTP</th>
              <th className="px-2 py-2 text-right">Chg%</th>
              <th className="px-2 py-2 text-right">Volume</th>
              <th className="px-2 py-2 text-right">Turnover</th>
              <th className="px-2 py-2 text-right italic text-gray-400" title="Estimated via tick-rule">Est. Buy (est.)</th>
              <th className="px-2 py-2 text-right italic text-gray-400" title="Estimated via tick-rule">Est. Sell (est.)</th>
              <th className="px-2 py-2 text-right italic text-gray-400" title="Estimated via tick-rule">Est. Net (est.)</th>
              <th className="px-2 py-2 text-right">CMF</th>
              <th className="px-2 py-2 text-right">MFI</th>
              <th className="px-2 py-2 text-right">Vol Z</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.symbol} className="border-b border-border/50 text-xs hover:bg-surface-2/50 transition-colors">
                <td className="sticky left-0 bg-surface px-2 py-1.5 font-bold text-foreground">{s.symbol}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${cls(s.changePercent)}`}>
                  {npr(s.ltp)}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${cls(s.changePercent)}`}>
                  {pct(s.changePercent)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                  {s.totalVolume.toLocaleString("en-IN")}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                  {compact(s.totalTurnover)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-up">
                  {s.estimateMethod ? npr(s.estBuyVolume) : MDASH}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-down">
                  {s.estimateMethod ? npr(s.estSellVolume) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                  s.estimateMethod ? cls(s.estNetVolume) : ""
                }`}>
                  {s.estimateMethod ? npr(s.estNetVolume) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${cls(s.cmf)}`}>
                  {s.cmf !== null && s.cmf !== undefined ? (s.cmf >= 0 ? "+" : "") + s.cmf.toFixed(3) : MDASH}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                  {s.mfi !== null && s.mfi !== undefined ? (s.mfi >= 0 ? "+" : "") + s.mfi.toFixed(1) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${
                  s.volumeZScore !== null && s.volumeZScore !== undefined
                    ? Math.abs(s.volumeZScore) > 2 ? "text-up font-bold" : "text-foreground"
                    : ""
                }`}>
                  {s.volumeZScore !== null && s.volumeZScore !== undefined
                    ? (s.volumeZScore >= 0 ? "+" : "") + s.volumeZScore.toFixed(2)
                    : MDASH}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Bar Chart (Inline SVG) ─────────────────────────────────────────────────

function BrokerBarChart({ history }: { history: BrokerDailyRecord[] }) {
  if (!history.length) return null;

  const maxVal = Math.max(...history.map((h) => Math.max(h.purchaseAmt, h.sellAmt)), 1);
  const W = 600, H = 220, PAD = { top: 20, bottom: 40, left: 55, right: 20 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barGap = 4;
  const groupW = chartW / history.length;
  const barW = Math.max((groupW - barGap * 2) / 2, 2);

  const yTicks = 5;
  const yStep = maxVal / yTicks;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" style={{ height: "auto", maxHeight: 150 }}>
      {/* Grid lines */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const y = PAD.top + chartH - (i / yTicks) * chartH;
        const val = (i / yTicks) * maxVal;
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD.left - 8} y={y + 3} textAnchor="end" className="fill-gray-400" fontSize="9">
              {compact(val)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {history.map((h, i) => {
        const x = PAD.left + i * groupW + barGap;
        const buyH = (h.purchaseAmt / maxVal) * chartH;
        const sellH = (h.sellAmt / maxVal) * chartH;
        const baseY = PAD.top + chartH;
        return (
          <g key={h.tradeDate}>
            {/* Purchase bar (green) */}
            <rect
              x={x} y={baseY - buyH} width={barW} height={buyH}
              fill="#00cc44" rx={2}
            >
              <title>{`${h.tradeDate} · Buy: ${compact(h.purchaseAmt)}`}</title>
            </rect>
            {/* Sell bar (red) */}
            <rect
              x={x + barW + barGap} y={baseY - sellH} width={barW} height={sellH}
              fill="#e60000" rx={2}
            >
              <title>{`${h.tradeDate} · Sell: ${compact(h.sellAmt)}`}</title>
            </rect>
            {/* Date label below */}
            <text x={x + groupW / 2} y={baseY + 16} textAnchor="middle" className="fill-gray-500" fontSize="9">
              {h.tradeDate.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Favorites ──────────────────────────────────────────────────────────────

const FAVS_KEY = "broker-favorites";

function loadFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveFavs(codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVS_KEY, JSON.stringify(codes));
  } catch {
    /* ignore quota / serialization errors */
  }
}

// ─── Broker Wise Tab ────────────────────────────────────────────────────────

function BrokerWiseTab({ range }: { range: TimeRange }) {
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [selected, setSelected] = useState<BrokerOption | null>(null);
  const [data, setData] = useState<BrokerWiseResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);

  // Load favorites on mount
  useEffect(() => {
    setFavs(loadFavs());
  }, []);

  const toggleFav = useCallback((code: string) => {
    setFavs((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      saveFavs(next);
      return next;
    });
  }, []);

  // Load brokers on mount
  useEffect(() => {
    fetch("/api/merolagani-broker")
      .then((r) => r.json())
      .then((d) => {
        if (d.brokers) {
          setBrokers(d.brokers.map((b: { broker: string; name: string }) => ({ broker: b.broker, name: b.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch broker-wise data when selection or range changes
  useEffect(() => {
    if (!selected) { setData(null); return; }
    setLoading(true);
    fetch(`/api/broker-wise/${selected.broker}?range=${range}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selected, range]);

  const filteredBrokers = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return brokers.filter(
      (b) => b.broker.includes(q) || b.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [brokers, search]);

  const handleSelect = useCallback((b: BrokerOption) => {
    setSelected(b);
    setSearch("");
    setOpen(false);
  }, []);

  return (
    <div>
      {/* Broker Search */}
      <div className="relative mb-4">
        <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Broker
        </label>
        <div className="relative">
          <input
            type="text"
            value={open ? search : (selected ? `${selected.broker} · ${selected.name}` : "")}
            onFocus={() => { setOpen(true); setSearch(""); }}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Search broker by code or name..."
            className="h-9 w-full max-w-md rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          />
          {open && filteredBrokers.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
              {filteredBrokers.map((b) => {
                const isFav = favs.includes(b.broker);
                return (
                  <div
                    key={b.broker}
                    className={`flex items-center px-3 py-2 text-xs transition hover:bg-surface-2 cursor-pointer ${
                      selected?.broker === b.broker ? "bg-primary/10 font-semibold" : ""
                    }`}
                    onMouseDown={() => handleSelect(b)}
                  >
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">{b.broker}</span>
                    <span className="ml-2 flex-1 text-foreground">{b.name}</span>
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); toggleFav(b.broker); }}
                      className={`ml-auto text-sm transition ${isFav ? "text-amber-400" : "text-gray-300 hover:text-amber-300"}`}
                      title={isFav ? "Remove from favorites" : "Add to favorites"}
                    >
                      {isFav ? "\u2605" : "\u2606"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {open && search.trim() && filteredBrokers.length === 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-surface p-3 text-center text-xs text-muted shadow-xl">
              No brokers match &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>

      {!selected && (
        <div className="py-12 text-center">
          <div className="text-3xl mb-2">🏢</div>
          <div className="text-sm text-muted">Select a broker to see their daily net-flow history.</div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
          <span className="ml-3 text-sm text-muted">Loading broker data...</span>
        </div>
      )}

      {selected && !loading && data && (
        <div className="rounded-lg border border-border bg-surface p-3">
          {/* Compact header + inline stats */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <span className="text-xs font-bold text-foreground">{data.brokerName}</span>
              <span className="ml-2 text-[10px] text-muted">#{data.brokerCode} · {data.source} · {data.daysAvailable}d</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              <span className="text-muted">Buy <b className="text-up">{compact(data.totals.buyAmount)}</b></span>
              <span className="text-muted">Sell <b className="text-down">{compact(data.totals.sellAmount)}</b></span>
              <span className="text-muted">Net <b className={cls(data.totals.netAmount)}>{data.totals.netAmount >= 0 ? "+" : ""}{compact(data.totals.netAmount)}</b></span>
              <span className="text-muted">Turnover <b className="text-foreground">{compact(data.totals.turnover)}</b></span>
            </div>
          </div>

          {/* Compact bar chart */}
          <div className="mt-2 border-t border-border/60 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted">Daily Buy/Sell</span>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#00cc44]" /><span className="text-muted">Buy</span></span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#e60000]" /><span className="text-muted">Sell</span></span>
              </div>
            </div>
            <BrokerBarChart history={data.history} />
          </div>

          {/* Full stock-wise detail for this broker (floorsheet): kun stock kati kitta */}
          <div className="mt-3 border-t border-border pt-3">
            <BrokerStockDetail brokerCode={data.brokerCode} brokerName={data.brokerName} />
          </div>
        </div>
      )}

      {selected && !loading && !data && (
        <div className="py-12 text-center">
          <div className="text-sm text-muted">No broker data available for this selection.</div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Tab ───────────────────────────────────────────────────────────

function SummaryTab({ range }: { range: TimeRange }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/merolagani-broker")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-sm text-muted">Loading market summary...</span>
      </div>
    );
  }

  const summary = data?.marketSummary || {};

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total Turnover</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {compact(summary.totalTurnover)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total Quantity</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {summary.totalQuantity?.toLocaleString("en-IN") || "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Transactions</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {summary.totalTransactions?.toLocaleString("en-IN") || "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Scrips Traded</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {summary.scripsTraded || "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Brokers Active</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {data?.brokerCount || "—"}
          </div>
        </div>
      </div>

      {/* All Brokers */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          All Brokers by Net Flow{data?.brokers?.length ? ` (${data.brokers.length})` : ""}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Broker</th>
                <th className="px-2 py-2 text-right">Buy Amount</th>
                <th className="px-2 py-2 text-right">Sell Amount</th>
                <th className="px-2 py-2 text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {data?.brokers?.map((b: any, i: number) => (
                <tr key={b.broker} className="border-b border-border/50 text-xs hover:bg-surface-2/50">
                  <td className="px-2 py-2 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2 font-semibold text-foreground">{b.broker} {b.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-up">{compact(b.purchase)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-down">{compact(b.sell)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-semibold ${b.net >= 0 ? "text-up" : "text-down"}`}>
                    {b.net >= 0 ? "+" : ""}{compact(b.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Broker Favorite Tab ────────────────────────────────────────────────────

function BrokerFavoriteTab({ brokers, range }: { brokers: BrokerOption[]; range: TimeRange }) {
  const [favs, setFavs] = useState<string[]>([]);
  const [cards, setCards] = useState<Record<string, any>>({});
  const [stocks, setStocks] = useState<Record<string, any[]>>({});
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFavs(loadFavs());
  }, []);

  useEffect(() => {
    if (!favs.length) {
      setCards({});
      setStocks({});
      return;
    }
    setLoading(true);
    Promise.all(
      favs.map((code) =>
        Promise.all([
          fetch(`/api/broker-wise/${code}?range=${range}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch(`/api/broker/${code}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ])
      )
    ).then((results) => {
      const brokerCards: Record<string, any> = {};
      const brokerStocks: Record<string, any[]> = {};
      favs.forEach((code, i) => {
        brokerCards[code] = results[i][0];
        const apiStocks = results[i][1]?.stocks || [];
        brokerStocks[code] = apiStocks
          .map((stock: any) => ({
            symbol: stock.symbol || stock.name || 'UNKNOWN',
            buyAmt: stock.buyAmt || 0,
            sellAmt: stock.sellAmt || 0,
            buyQty: stock.buyQty || 0,
            sellQty: stock.sellQty || 0,
            netAmt: stock.netAmt || 0,
          }))
          .sort((a: any, b: any) => (b.netAmt || 0) - (a.netAmt || 0))
          .slice(0, 25);
      });
      setCards(brokerCards);
      setStocks(brokerStocks);
      setLoading(false);
    });
  }, [favs, range]);

  const addAllBrokers = () => {
    const allCodes = brokers.map((b) => b.broker);
    setFavs(allCodes);
    saveFavs(allCodes);
  };

  const removeFav = (code: string) => {
    const next = favs.filter((c) => c !== code);
    setFavs(next);
    saveFavs(next);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          ⭐ My Favorites ({favs.length})
          {loading && <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />}
        </label>
        <button
          onClick={addAllBrokers}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-primary/90"
        >
          + Add All Brokers
        </button>
      </div>

      {/* Favorite brokers — top 5 buy & top 5 sell stocks (aggressive activity) */}
      <div>
        <h3 className="mb-1 text-xs font-bold text-foreground">⭐ Favorite Brokers — top 5 buy &amp; top 5 sell stocks</h3>
        <p className="mb-2 text-[10px] text-muted">Kun stock favorite broker le aggressive kinyo/bechyo (kitta le rank)</p>
        <BrokerStockPanels onlyBrokers={favs} />
      </div>

      {!favs.length ? (
        <div className="py-12 text-center">
          <div className="text-3xl mb-2">⭐</div>
          <div className="text-sm text-muted">Click "Add All Brokers" or star brokers in Broker Wise tab to add favorites.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {favs.map((code) => {
            const c = cards[code];
            const b = brokers.find((x) => x.broker === code);
            const brokerStockList = stocks[code] || [];
            const isExpanded = expandedBroker === code;

            return (
              <div key={code} className="rounded-lg border border-border bg-surface overflow-hidden">
                {/* Header */}
                <div className="p-3 relative group border-b border-border">
                  <button
                    onClick={() => removeFav(code)}
                    className="absolute top-2 right-2 rounded text-xs px-2 py-1 bg-red-500/20 text-red-600 opacity-0 group-hover:opacity-100 transition"
                  >
                    Remove
                  </button>
                  <div className="mb-3">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">{code}</span>
                    <span className="ml-2 text-[10px] font-semibold text-foreground">{b?.name || code}</span>
                  </div>
                  {c ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div>
                          <span className="text-muted">Buy</span>
                          <div className="text-right tabular-nums text-up font-semibold">{compact(c.totals.buyAmount)}</div>
                        </div>
                        <div>
                          <span className="text-muted">Sell</span>
                          <div className="text-right tabular-nums text-down font-semibold">{compact(c.totals.sellAmount)}</div>
                        </div>
                        <div>
                          <span className="text-muted">Net</span>
                          <div className={`text-right tabular-nums font-semibold ${c.totals.netAmount >= 0 ? "text-up" : "text-down"}`}>
                            {c.totals.netAmount >= 0 ? "+" : ""}{compact(c.totals.netAmount)}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted">Days</span>
                          <div className="text-right tabular-nums font-semibold">{c.daysAvailable}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-muted">{loading ? "Loading..." : "No data"}</div>
                  )}
                </div>

                {/* Stocks Grid Toggle */}
                <button
                  onClick={() => setExpandedBroker(isExpanded ? null : code)}
                  className="w-full px-3 py-2 text-[9px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition border-t border-border flex items-center justify-between"
                >
                  <span>📊 Stocks ({brokerStockList.length})</span>
                  <span>{isExpanded ? "▼" : "▶"}</span>
                </button>

                {/* Stocks Grid (5 columns × 5 rows max) */}
                {isExpanded && brokerStockList.length > 0 && (
                  <div className="p-2 bg-surface-2 border-t border-border">
                    <div className="grid grid-cols-5 gap-1">
                      {brokerStockList.map((stock: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded border border-border bg-surface p-1.5 text-center hover:border-primary/50 transition"
                          title={`${stock.symbol}: Buy ${compact(stock.buyAmt)} | Sell ${compact(stock.sellAmt)}`}
                        >
                          <div className="text-[8px] font-bold text-foreground truncate">{stock.symbol}</div>
                          <div className="text-[7px] text-up font-semibold">B: {compact(stock.buyAmt || 0).replace("Rs. ", "")}</div>
                          <div className="text-[7px] text-down font-semibold">S: {compact(stock.sellAmt || 0).replace("Rs. ", "")}</div>
                          <div className={`text-[7px] font-semibold ${stock.netAmt >= 0 ? "text-up" : "text-down"}`}>
                            {stock.netAmt >= 0 ? "+" : ""}{compact(stock.netAmt || 0).replace("Rs. ", "")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && brokerStockList.length === 0 && (
                  <div className="p-2 text-center text-[9px] text-muted">No stocks data</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function getRangeDate(_range: TimeRange): string {
  // Return empty so the API auto-selects the LATEST available trading day.
  // This makes the page follow new data automatically instead of pinning to "today".
  return "";
}

export default function BrokerAnalysisPage() {
  const [tab, setTab] = useState<"stock" | "broker" | "flow" | "summary" | "favorite" | "performance">("stock");
  const [range, setRange] = useState<TimeRange>("1D");
  const [mounted, setMounted] = useState(false);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [coverage, setCoverage] = useState<{ days: number; firstDate: string | null; lastDate: string | null; targetDays: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/broker-coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setCoverage(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/merolagani-broker")
      .then((r) => r.json())
      .then((d) => {
        if (d.brokers) {
          setBrokers(d.brokers.map((b: { broker: string; name: string }) => ({ broker: b.broker, name: b.name })));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-bold text-foreground">Broker Analysis</h1>
        <p className="text-xs text-muted">
          {tab === "stock"
            ? "Stock-level floorsheet activity with tick-rule estimated buy/sell pressure"
            : tab === "broker"
            ? "Real broker performance with stock-level buy/sell activity from NEPSE"
            : tab === "flow"
            ? "Stock-wise broker flow — kun broker le kati kitta uthayo (BUY / SELL / HOLD)"
            : tab === "summary"
            ? "Market overview and broker performance summary"
            : tab === "favorite"
            ? "Your favorite brokers and holdings"
            : "All brokers performance with correct time-range aggregation (1D, 3D, 1W, 1M, 3M)"}
        </p>
        {mounted && coverage && coverage.days > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 font-semibold text-foreground">
              📅 {coverage.days} {coverage.days === 1 ? "day" : "days"} stored
              {coverage.firstDate && coverage.lastDate && (
                <span className="font-normal text-muted">
                  · {coverage.firstDate} → {coverage.lastDate}
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-muted">
              {Math.min(100, Math.round((coverage.days / coverage.targetDays) * 100))}% toward 1 year
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-500">
              ✓ Real data
            </span>
          </div>
        )}
      </div>

      {/* Tab Bar + Time Range */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 overflow-x-auto">
          <button
            onClick={() => setTab("stock")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "stock" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Stock Wise
          </button>
          <button
            onClick={() => setTab("broker")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "broker" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Broker Wise
          </button>
          <button
            onClick={() => setTab("flow")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "flow" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            📊 Flow
          </button>
          <button
            onClick={() => setTab("summary")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "summary" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setTab("favorite")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "favorite" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Broker Favorite
          </button>
          <button
            onClick={() => setTab("performance")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === "performance" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            📊 Performance
          </button>
        </div>

        {/* Time Range Pills */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                range === r ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        {mounted && tab === "stock" && <StockWiseTab dateKey={getRangeDate(range)} />}
        {mounted && tab === "broker" && <BrokerWiseTab range={range} />}
        {mounted && tab === "flow" && <StockBrokerFlow />}
        {mounted && tab === "summary" && <SummaryTab range={range} />}
        {mounted && tab === "favorite" && <BrokerFavoriteTab brokers={brokers} range={range} />}
        {mounted && tab === "performance" && <BrokerPerformanceSection />}
      </div>

      {/* Footer note */}
      <div className="mt-3 text-[10px] text-muted text-center">
        Est. values via tick-rule classification &middot; Stock-wise broker kitta from floorsheet data
      </div>
    </div>
  );
}
