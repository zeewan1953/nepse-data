"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { BrokerPerformanceSection } from "./broker-performance";
import { StockBrokerFlow } from "./StockBrokerFlow";
import { BrokerStockPanels } from "./BrokerStockPanels";
import { StockWiseTable } from "./StockWiseTable";
import { BrokerStockDetail } from "./BrokerStockDetail";

// ─── Types ──────────────────────────────────────────────────────────────────

type StockWiseItem = {
  symbol: string;
  ltp: number | null;
  changePercent: number | null;
  totalVolume: number;
  totalTurnover: number;
  tradeCount: number;
  avgPrice: number | null;
  brokerBuy: number | null;
  brokerSell: number | null;
  brokerNet: number | null;
  cmf: number | null;
  mfi: number | null;
  volZ: number | null;
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

type SortKey = "turnover" | "net" | "buy" | "sell" | "cmf" | "mfi" | "volz" | "avg" | "symbol" | "ltp" | "change" | "volume";
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
  { key: "symbol", label: "Symbol" },
  { key: "ltp", label: "LTP" },
  { key: "change", label: "Chg%" },
  { key: "volume", label: "Volume" },
  { key: "turnover", label: "Turnover" },
  { key: "buy", label: "Broker Buy" },
  { key: "sell", label: "Broker Sell" },
  { key: "net", label: "Broker Net" },
  { key: "cmf", label: "CMF" },
  { key: "mfi", label: "MFI" },
  { key: "volz", label: "Vol Z" },
  { key: "avg", label: "Avg Price" },
];

// ─── Stock Wise Table ──────────────────────────────────────────────────────

function StockWiseTab({ dateKey }: { dateKey: string }) {
  const [data, setData] = useState<StockWiseResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("turnover");
  const [query, setQuery] = useState("");
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchWithDate = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const bust = Date.now();
      const dateQ = date ? `date=${encodeURIComponent(date)}&` : "";
      const res = await fetch(`/api/stock-wise?${dateQ}sort=${sort}&_t=${bust}`, { cache: "no-store" });
      const d: any = await res.json();
      if (d.stocks && d.stocks.length > 0) {
        setData({
          date: d.date,
          stocks: d.stocks.map((s: any) => ({
            symbol: s.symbol,
            ltp: s.ltp,
            changePercent: s.changePercent,
            totalVolume: s.totalVolume || 0,
            totalTurnover: s.totalTurnover || 0,
            tradeCount: s.tradeCount || 0,
            avgPrice: s.avgPrice || null,
            brokerBuy: s.estBuyVolume,
            brokerSell: s.estSellVolume,
            brokerNet: s.estNetVolume,
            cmf: s.cmf,
            mfi: s.mfi,
            volZ: s.volumeZScore,
          })),
          source: d.source,
        });
        setLastFetched(Date.now());
      } else {
        setData({
          date: d.date || date,
          stocks: [],
          source: d.source || "database",
        });
        setLastFetched(Date.now());
      }
    } catch { setData(null); }
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    fetchWithDate(dateKey);
  }, [dateKey, fetchWithDate]);

  // Auto-refresh every 30 seconds when tab is visible and autoRefresh is on
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchWithDate(dateKey);
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, dateKey, fetchWithDate]);

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
        <div className="text-sm text-muted">No broker data available for {dateKey || "latest date"}.</div>
        <p className="mt-2 text-[10px] text-muted">Click "Sync Now" at the top to fetch latest data from NEPSE floorsheet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[10px] text-muted mr-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3 w-3 rounded border-border"
          />
          Auto-refresh 30s
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol..."
          className="h-7 w-36 rounded border border-border bg-background px-2 text-[10px] outline-none focus:border-primary"
        />
        <div className="flex items-center gap-0.5 rounded border border-border p-0.5">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition ${
                sort === o.key ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] text-muted">
          {data?.date ? `Data: ${data.date}` : ""}
          {lastFetched && ` · Updated ${new Date(lastFetched).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`}
          {" · "}
          {data?.stocks.length ?? 0} stocks · {data?.source}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
              <th className="sticky left-0 bg-surface px-2 py-2 text-left cursor-pointer hover:text-foreground" onClick={() => setSort("symbol")}>Symbol {sort === "symbol" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("ltp")}>LTP {sort === "ltp" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("change")}>Chg% {sort === "change" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("volume")}>Volume {sort === "volume" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("turnover")}>Turnover {sort === "turnover" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("buy")}>Broker Buy {sort === "buy" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("sell")}>Broker Sell {sort === "sell" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("net")}>Broker Net {sort === "net" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("cmf")}>CMF {sort === "cmf" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("mfi")}>MFI {sort === "mfi" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("volz")}>Vol Z {sort === "volz" ? "▲" : ""}</th>
              <th className="px-2 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSort("avg")}>Avg Price {sort === "avg" ? "▲" : ""}</th>
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
                <td className="px-2 py-1.5 text-right tabular-nums text-up font-semibold">
                  {s.brokerBuy != null ? compact(s.brokerBuy) : MDASH}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-down font-semibold">
                  {s.brokerSell != null ? compact(s.brokerSell) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${s.brokerNet != null && s.brokerNet >= 0 ? "text-up" : "text-down"}`}>
                  {s.brokerNet != null ? (s.brokerNet >= 0 ? "+" : "") + compact(s.brokerNet) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${cls(s.cmf)}`}>
                  {s.cmf !== null && s.cmf !== undefined ? (s.cmf >= 0 ? "+" : "") + s.cmf.toFixed(3) : MDASH}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                  {s.mfi !== null && s.mfi !== undefined ? (s.mfi >= 0 ? "+" : "") + s.mfi.toFixed(1) : MDASH}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${
                  s.volZ !== null && s.volZ !== undefined
                    ? Math.abs(s.volZ) > 2 ? "text-up font-bold" : "text-foreground"
                    : ""
                }`}>
                  {s.volZ !== null && s.volZ !== undefined
                    ? (s.volZ >= 0 ? "+" : "") + s.volZ.toFixed(2)
                    : MDASH}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                  {npr(s.avgPrice)}
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
  const [selected, setSelected] = useState<BrokerOption | null>(() => {
    if (typeof window === "undefined") return { broker: "1", name: "" };
    const saved = localStorage.getItem("axion_selectedBroker");
    return saved ? JSON.parse(saved) : { broker: "1", name: "" };
  });
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

  // Load brokers on mount — sort: #1 first, then numeric 2-100, then A-Z by name
  useEffect(() => {
    fetch("/api/merolagani-broker")
      .then((r) => r.json())
      .then((d) => {
        if (d.brokers) {
          const list = d.brokers.map((b: { broker: string; name: string }) => ({ broker: b.broker, name: b.name }));
          list.sort((a: { broker: string; name: string }, b: { broker: string; name: string }) => {
            const aNum = parseInt(a.broker, 10);
            const bNum = parseInt(b.broker, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            if (!isNaN(aNum)) return -1;
            if (!isNaN(bNum)) return 1;
            return a.name.localeCompare(b.name);
          });
          setBrokers(list);
          // Fill in broker 1 name if selected but name is empty
          setSelected((prev) => {
            if (prev?.broker === "1" && !prev.name) {
              const b1 = list.find((b: BrokerOption) => b.broker === "1");
              if (b1) { localStorage.setItem("axion_selectedBroker", JSON.stringify(b1)); return b1; }
            }
            return prev;
          });
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
    if (!search.trim()) return brokers;
    const q = search.toLowerCase();
    return brokers.filter(
      (b) => b.broker.includes(q) || b.name.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [brokers, search]);

  const handleSelect = useCallback((b: BrokerOption) => {
    setSelected(b);
    localStorage.setItem("axion_selectedBroker", JSON.stringify(b));
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
    fetch("/api/stock-summary")
      .then((r) => (r.ok ? r.json() : null))
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
        <span className="ml-3 text-sm text-muted">Loading summary...</span>
      </div>
    );
  }

  const stocks = data?.stocks || [];

  const totalBrokerBuy = stocks.reduce((s: number, x: any) => s + (x.brokerBuy || 0), 0);
  const totalBrokerSell = stocks.reduce((s: number, x: any) => s + (x.brokerSell || 0), 0);
  const totalBrokerNet = totalBrokerBuy - totalBrokerSell;
  const totalTurnover = stocks.reduce((s: number, x: any) => s + (x.turnover || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Date</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {data?.date || "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Stocks</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {stocks.length || "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Broker Buy</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {compact(totalBrokerBuy)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Broker Sell</div>
          <div className="mt-2 text-base font-bold text-foreground tabular-nums">
            {compact(totalBrokerSell)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Broker Net</div>
          <div className={`mt-2 text-base font-bold tabular-nums ${cls(totalBrokerNet)}`}>
            {totalBrokerNet >= 0 ? "+" : ""}{compact(totalBrokerNet)}
          </div>
        </div>
      </div>

      {/* All Stocks — Broker Buy/Sell/Net */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Stock Wise Broker Summary {stocks.length ? `(${stocks.length})` : ""}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th className="px-2 py-2 text-left">Symbol</th>
                <th className="px-2 py-2 text-right">LTP</th>
                <th className="px-2 py-2 text-right">Change%</th>
                <th className="px-2 py-2 text-right">Quantity</th>
                <th className="px-2 py-2 text-right">Turnover</th>
                <th className="px-2 py-2 text-right">Broker Buy</th>
                <th className="px-2 py-2 text-right">Broker Sell</th>
                <th className="px-2 py-2 text-right">Broker Net</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s: any, i: number) => (
                <tr key={s.symbol} className="border-b border-border/50 text-xs hover:bg-surface-2/50">
                  <td className="px-2 py-2 font-semibold text-foreground">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 mr-2">{i + 1}</span>
                    {s.symbol}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">₹{s.ltp?.toLocaleString("en-IN")}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${s.changePct >= 0 ? "text-up" : "text-down"}`}>
                    {s.changePct >= 0 ? "+" : ""}{s.changePct?.toFixed(2)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(s.quantity || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {s.turnoverLabel}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-up">{compact(s.brokerBuy)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-down">{compact(s.brokerSell)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-semibold ${s.brokerNet >= 0 ? "text-up" : "text-down"}`}>
                    {s.brokerNet >= 0 ? "+" : ""}{compact(s.brokerNet)}
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
  const [popupStock, setPopupStock] = useState<{ symbol: string; buyAmt: number; sellAmt: number; netAmt: number; brokerName: string } | null>(null);

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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-muted text-[9px] font-semibold uppercase tracking-wider">
                <th className="text-left px-2 py-1.5 w-8">#</th>
                <th className="text-left px-2 py-1.5">Broker</th>
                <th className="text-right px-2 py-1.5">Buy</th>
                <th className="text-right px-2 py-1.5">Sell</th>
                <th className="text-right px-2 py-1.5">Net</th>
                <th className="text-right px-2 py-1.5">Days</th>
                <th className="text-right px-2 py-1.5">Stocks</th>
                <th className="text-right px-2 py-1.5 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {favs.map((code, idx) => {
                const c = cards[code];
                const b = brokers.find((x) => x.broker === code);
                const brokerStockList = stocks[code] || [];
                const isExpanded = expandedBroker === code;

                return (
                  <tr key={code} className="hover:bg-surface-2 transition">
                    <td className="px-2 py-1 text-muted text-[9px]">{idx + 1}</td>
                    <td className="px-2 py-1 font-medium text-foreground truncate max-w-[160px]">
                      <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-bold text-gray-600 mr-1">{code}</span>
                      <span className="text-[9px]">{b?.name || code}</span>
                    </td>
                    {c ? (
                      <>
                        <td className="px-2 py-1 text-right tabular-nums text-up font-semibold">{compact(c.totals.buyAmount)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-down font-semibold">{compact(c.totals.sellAmount)}</td>
                        <td className={`px-2 py-1 text-right tabular-nums font-semibold ${c.totals.netAmount >= 0 ? "text-up" : "text-down"}`}>
                          {c.totals.netAmount >= 0 ? "+" : ""}{compact(c.totals.netAmount)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{c.daysAvailable}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-2 py-1 text-muted text-[9px]">{loading ? "Loading..." : "No data"}</td>
                    )}
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => setExpandedBroker(isExpanded ? null : code)}
                        className="text-[9px] font-semibold text-muted hover:text-foreground"
                      >
                        {brokerStockList.length} {isExpanded ? "▲" : "▼"}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => removeFav(code)}
                        className="text-[8px] text-red-500 hover:text-red-700 font-semibold"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Expanded stock details */}
          {favs.map((code) => {
            const brokerStockList = stocks[code] || [];
            const expandedB = brokers.find((x) => x.broker === code);
            if (expandedBroker !== code || brokerStockList.length === 0) return null;
            return (
              <div key={`exp-${code}`} className="border-t border-border bg-surface-2 p-2">
                <div className="grid grid-cols-5 gap-1">
                  {brokerStockList.map((stock: any, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => setPopupStock({ symbol: stock.symbol, buyAmt: stock.buyAmt || 0, sellAmt: stock.sellAmt || 0, netAmt: stock.netAmt || 0, brokerName: expandedB?.name || code })}
                      className="rounded border border-border bg-surface p-1.5 text-center hover:border-primary/50 hover:shadow-sm cursor-pointer transition"
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
            );
          })}
        </div>
      )}

      {/* Stock popup */}
      {popupStock && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setPopupStock(null)}>
          <div className="bg-surface rounded-xl border border-border shadow-xl w-[260px] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">{popupStock.symbol}</h3>
              <button onClick={() => setPopupStock(null)} className="text-muted hover:text-foreground text-lg leading-none">&times;</button>
            </div>
            <div className="text-[10px] text-muted mb-3">{popupStock.brokerName}</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-up font-semibold">Buy</span>
                <span className="tabular-nums font-bold">{compact(popupStock.buyAmt)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-down font-semibold">Sell</span>
                <span className="tabular-nums font-bold">{compact(popupStock.sellAmt)}</span>
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-border">
                <span className="font-semibold text-foreground">Net</span>
                <span className={`tabular-nums font-bold ${popupStock.netAmt >= 0 ? "text-up" : "text-down"}`}>
                  {popupStock.netAmt >= 0 ? "+" : ""}{compact(popupStock.netAmt)}
                </span>
              </div>
            </div>
          </div>
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
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  // Auto-refresh indicator only — individual tabs handle their own refresh
  useEffect(() => {
    const id = setInterval(() => {
      // lightweight keep-alive: re-fetch brokers list silently
      fetch("/api/merolagani-broker", { cache: "no-store" }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleGlobalSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/floorsheet/sync?force=true", { cache: "no-store" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setLastSyncTime(Date.now());
      // Force reload the page to pick up new DB data everywhere
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      console.error("Sync failed:", e);
      alert("Sync failed: " + (e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

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
    <div className="mx-auto max-w-[1200px] px-3">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-base font-bold text-foreground">NEPSE AXION <span className="text-[11px] font-normal text-muted">· Broker Analysis</span></h1>
        <p className="text-[11px] text-muted mt-0.5">
          {tab === "stock"
            ? "Stock-level floorsheet activity with tick-rule estimated buy/sell pressure"
            : tab === "broker"
            ? "Real broker performance with stock-level buy/sell activity from NEPSE"
            : tab === "flow"
            ? "Stock-wise broker flow"
            : tab === "summary"
            ? "Market overview and broker performance summary"
            : tab === "favorite"
            ? "Your favorite brokers and holdings"
            : "All brokers performance with correct time-range aggregation"}
        </p>
        {mounted && coverage && coverage.days > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
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

      {/* Tabs — top left, compact */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setTab("stock")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "stock" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Stock Wise
          </button>
          <button
            onClick={() => setTab("broker")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "broker" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Broker Wise
          </button>
          <button
            onClick={() => setTab("flow")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "flow" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            📊 Flow
          </button>
          <button
            onClick={() => setTab("summary")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "summary" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setTab("favorite")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "favorite" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Broker Favorite
          </button>
          <button
            onClick={() => setTab("performance")}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition whitespace-nowrap ${
              tab === "performance" ? "bg-primary text-white" : "text-muted hover:text-foreground"
            }`}
          >
            📊 Performance
          </button>
        </div>

        {/* Time Range Pills */}
        <div className="ml-auto flex items-center gap-0.5 rounded border border-border p-0.5">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-[9px] font-semibold transition ${
                range === r ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-refresh indicator */}
      <div className="mb-2 text-[10px] text-muted">Auto-refreshing every 5s</div>

      {/* Tab Content */}
      <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        {mounted && tab === "stock" && <StockWiseTable />}
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
