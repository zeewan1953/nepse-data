"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface SeriesPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalValue {
  rawValue: number | null;
  signal: string | null;
}

interface SymbolData {
  symbol: string;
  series: SeriesPoint[];
  signals: Record<string, SignalValue>;
  latestClose: number | null;
}

const LINE_COLORS = ["#00cc44", "#0044ff", "#e60000", "#d4af37", "#8b5cf6"];
const RANGE_OPTIONS = [
  { label: "1W", value: "1w" },
  { label: "1M", value: "1m" },
  { label: "3M", value: "3m" },
  { label: "6M", value: "6m" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
];

const SIGNAL_LABELS: Record<string, string> = {
  momentum_score: "Momentum Score",
  smart_money_score: "Smart Money",
  cmf: "CMF (20)",
  mfi: "MFI (14)",
  volume_zscore: "Volume Z-Score",
  order_flow_est: "Order Flow (est.)",
  net_broker_flow: "Net Broker Flow",
  rsi_14: "RSI (14)",
  psar: "Parabolic SAR",
  macd: "MACD",
  bollinger_b: "Bollinger %B",
  adx: "ADX",
  stoch_k: "Stochastic %K",
  ema_cross: "EMA 9/21 Cross",
  sma_cross: "SMA 50/200 Cross",
  obv_trend: "OBV Trend",
  ichimoku: "Ichimoku",
  vwap_dev: "VWAP Dev",
  roc: "ROC",
  supertrend: "Supertrend",
  williams_r: "Williams %R",
  tma_dma_cross: "TMA/DMA Cross",
  dema_cross: "DEMA Cross",
  tema_cross: "TEMA Cross",
};

function buildSvgPath(
  points: SeriesPoint[],
  width: number,
  height: number
): string | null {
  if (points.length < 2) return null;
  const basePrice = points[0].close;
  const prices = points.map((p) => (p.close / basePrice) * 100);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;
  const stepX = width / (prices.length - 1);
  return prices
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - minPrice) / range) * (height - 10) - 5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

function formatValue(val: number | null, signal: string | null): string {
  if (val === null) return "—";
  if (signal === "BUY") return `+${val.toFixed(2)}`;
  if (signal === "SELL") return `${val.toFixed(2)}`;
  return val.toFixed(2);
}

export default function ComparePage() {
  const [searchVal, setSearchVal] = useState("");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [range, setRange] = useState("6m");
  const [data, setData] = useState<SymbolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const sym = q.trim().toUpperCase();
    if (!selectedSymbols.includes(sym) && selectedSymbols.length < 5) {
      setSelectedSymbols(prev => [...prev, sym]);
    }
    setSearchVal("");
  }, [selectedSymbols]);

  const removeSymbol = (sym: string) => {
    setSelectedSymbols(prev => prev.filter(s => s !== sym));
  };

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setData([]);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ symbols: selectedSymbols.join(","), range });
    fetch(`/api/compare?${params}`)
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j.error || "Request failed") }))
      .then(j => setData(j.symbols || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSymbols.join(","), range]);

  const svgW = typeof window !== "undefined" ? Math.min(window.innerWidth - 40, 600) : 600;
  const svgH = 220;

  const allSignalKeys = Array.from(new Set(data.flatMap(d => Object.keys(d.signals))));
  const orderedSignals = [
    "momentum_score", "cmf", "mfi", "volume_zscore", "order_flow_est",
    "net_broker_flow", "rsi_14", "macd", "psar", "bollinger_b",
    "adx", "stoch_k", "williams_r", "roc", "vwap_dev",
    "ema_cross", "sma_cross", "obv_trend", "ichimoku", "supertrend",
    "tma_dma_cross", "dema_cross", "tema_cross",
  ].filter(k => allSignalKeys.includes(k));

  return (
    <div className="p-3 text-[#e0e0e0] max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/portfolio" className="text-[#8ab4f8] hover:underline text-[11px]">&larr; Portfolio</Link>
        <h1 className="text-sm font-bold text-white">Multi-Stock Comparison</h1>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") doSearch(searchVal); }}
          placeholder="Type symbol e.g. NABIL"
          className="rounded-lg border border-[#1a1a2e] bg-[#0f0f1e] px-3 py-1.5 text-xs text-white outline-none focus:border-[#334] w-40"
        />
        <button onClick={() => doSearch(searchVal)} className="rounded-lg bg-[#1a3a5c] px-3 py-1.5 text-[11px] text-[#8ab4f8] border border-[#2a5a8c] hover:bg-[#1a4a6c]">Add</button>
        <div className="flex gap-1 ml-auto">
          {RANGE_OPTIONS.map(ro => (
            <button key={ro.value} onClick={() => setRange(ro.value)}
              className={`rounded px-2 py-1 text-[10px] font-semibold transition ${range === ro.value ? "bg-[#1a3a5c] text-[#8ab4f8] border border-[#2a5a8c]" : "text-[#556] hover:text-[#8ab4f8]"}`}>
              {ro.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected symbol tags */}
      {selectedSymbols.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {selectedSymbols.map((sym, i) => (
            <span key={sym} className="inline-flex items-center gap-1 rounded bg-[#1a1a2e] px-2 py-0.5 text-[11px] font-semibold" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>
              {sym}
              <button onClick={() => removeSymbol(sym)} className="text-[#556] hover:text-white">&times;</button>
            </span>
          ))}
        </div>
      )}

      {error && <div className="text-[#e60000] text-xs mb-2">{error}</div>}

      {loading ? (
        <div className="text-[#888] py-8 text-center text-xs">Loading...</div>
      ) : data.length > 0 ? (
        <>
          {/* Line chart */}
          <div className="rounded-lg border border-[#1a1a2e] bg-[#0f0f1e] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-[#556] font-semibold uppercase">Rebased to 100</span>
              <div className="flex gap-2">
                {data.map((d, i) => (
                  <span key={d.symbol} className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                    {d.symbol}
                  </span>
                ))}
              </div>
            </div>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: svgH }}>
              {[0, 1, 2, 3].map(i => (
                <line key={i} x1="0" y1={(svgH / 4) * i} x2={svgW} y2={(svgH / 4) * i} stroke="#1a1a2e" strokeWidth="0.5" />
              ))}
              {data.map((d, i) => {
                const path = buildSvgPath(d.series, svgW, svgH);
                if (!path) return null;
                return <path key={d.symbol} d={path} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />;
              })}
            </svg>
          </div>

          {/* Signal comparison table */}
          <div className="overflow-x-auto rounded-lg border border-[#1a1a2e]">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[#0f0f1e] border-b border-[#1a1a2e] text-[#667] text-[9px] font-semibold uppercase tracking-wider">
                  <th className="text-left px-2 py-1.5">Signal</th>
                  {data.map(d => (
                    <th key={d.symbol} className="text-right px-2 py-1.5">{d.symbol}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a2e]">
                {orderedSignals.map(sigKey => (
                  <tr key={sigKey} className="hover:bg-[#0f0f1e]/60 transition">
                    <td className="px-2 py-1 font-medium text-[#7aa8f0] text-[10px] whitespace-nowrap">{SIGNAL_LABELS[sigKey] || sigKey}</td>
                    {data.map(d => {
                      const s = d.signals[sigKey];
                      const val = s?.rawValue ?? null;
                      const sig = s?.signal ?? null;
                      const isEst = sigKey === "order_flow_est";
                      return (
                        <td key={d.symbol} className={`px-2 py-1 text-right tabular-nums font-semibold ${
                          sig === "BUY" ? "text-[#00cc44]" : sig === "SELL" ? "text-[#e60000]" : "text-[#556]"
                        }`}>
                          {val !== null ? `${sig === "BUY" ? "+" : ""}${val.toFixed(2)}${isEst ? " (est.)" : ""}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : selectedSymbols.length > 0 && !loading ? (
        <div className="text-[#555] py-8 text-center text-xs">No data — try a different symbol or range</div>
      ) : (
        <div className="text-[#555] py-8 text-center text-xs">Search and add up to 5 symbols to compare</div>
      )}
    </div>
  );
}
