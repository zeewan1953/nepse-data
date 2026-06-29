"use client";
import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/useLive";
import { num, pct, changeClass } from "@/lib/format";

type OHLCVPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SignalData = {
  momentum?: number | null;
  smartMoney?: number | null;
  volumeZ?: number | null;
  cmf?: number | null;
  mfi?: number | null;
  orderFlow?: string | null;
  netBrokerFlow?: number | null;
};

type CompareStock = {
  symbol: string;
  series: OHLCVPoint[];
  signals: SignalData;
  latestPrice: number | null;
};

type CompareResp = {
  symbols: CompareStock[];
  range: string;
};

const SYMBOLS = [
  "NABIL", "ADBL", "SCB", "NICA", "GBIME",
  "HDHPC", "UPPER", "CHCL", "NTC", "NTC",
  "NRIC", "SRL", "PRIN", "CIT", "EBL",
];

const RANGES = ["1m", "3m", "6m", "1y"];

export default function ComparePage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [range, setRange] = useState("6m");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const symbolsKey = selected.sort().join(",");
  const compare = usePoll<CompareResp>(
    symbolsKey ? `/api/compare?symbols=${encodeURIComponent(symbolsKey)}&range=${range}` : "",
    30_000
  );

  const filteredSymbols = useMemo(() => {
    if (!search) return SYMBOLS;
    return SYMBOLS.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const addSymbol = (sym: string) => {
    if (selected.length >= 5) return;
    if (selected.includes(sym)) return;
    setSelected([...selected, sym]);
    setSearch("");
    setShowSearch(false);
  };

  const removeSymbol = (sym: string) => {
    setSelected(selected.filter(s => s !== sym));
  };

  // Compute rebased series (indexed to 100)
  const rebasedData = useMemo(() => {
    if (!compare.data?.symbols) return [];
    return compare.data.symbols.map((stock: CompareStock) => {
      if (!stock.series || stock.series.length === 0) return { symbol: stock.symbol, rebased: [] };
      const firstClose = stock.series[0].close;
      const rebased = stock.series.map((point: OHLCVPoint) => ({
        date: point.date,
        value: firstClose > 0 ? (point.close / firstClose) * 100 : null,
      }));
      return { symbol: stock.symbol, rebased };
    });
  }, [compare.data]);

  // Chart colors
  const COLORS = ["#1d72d2", "#00cc44", "#e60000", "#d4af37", "#8b5cf6"];

  // Find min/max for Y axis
  const yRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const stock of rebasedData) {
      for (const point of stock.rebased) {
        if (point.value !== null) {
          min = Math.min(min, point.value);
          max = Math.max(max, point.value);
        }
      }
    }
    return { min: min === Infinity ? 90 : min - 5, max: max === -Infinity ? 110 : max + 5 };
  }, [rebasedData]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-space">Multi-Stock Comparison</h1>
        <p className="text-sm text-muted">Compare up to 5 stocks · Indexed to 100</p>
      </div>

      {/* Controls */}
      <div className="card p-4 space-y-3">
        {/* Selected symbols */}
        <div className="flex flex-wrap gap-2">
          {selected.map(sym => (
            <span
              key={sym}
              className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
            >
              {sym}
              <button
                onClick={() => removeSymbol(sym)}
                className="text-primary hover:text-primary-700"
              >
                ×
              </button>
            </span>
          ))}
          {selected.length < 5 && (
            <div className="relative">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-muted hover:border-primary"
              >
                + Add Stock
              </button>
              {showSearch && (
                <div className="absolute top-full left-0 z-10 mt-1 w-64 rounded-lg border border-border bg-surface p-2 shadow-lg">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search symbol..."
                    className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    {filteredSymbols.map(sym => (
                      <button
                        key={sym}
                        onClick={() => addSymbol(sym)}
                        className="w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Range selector */}
        <div className="flex gap-2">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                range === r
                  ? "bg-primary text-white"
                  : "bg-surface-2 text-muted hover:bg-surface"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {rebasedData.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <p>Add stocks to compare</p>
        </div>
      ) : (
        <div className="card p-4">
          <h2 className="mb-3 font-bold font-space">Performance (Indexed to 100)</h2>
          <div className="relative h-64 w-full">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 h-full w-12 text-xs text-muted font-mono">
              <div className="absolute right-1 top-0">{yRange.max.toFixed(0)}</div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                {((yRange.max + yRange.min) / 2).toFixed(0)}
              </div>
              <div className="absolute right-1 bottom-0">{yRange.min.toFixed(0)}</div>
            </div>

            {/* Chart area */}
            <div className="ml-12 h-full border-l border-border relative">
              {/* Grid lines */}
              <div className="absolute inset-0">
                <div className="absolute top-0 left-0 right-0 border-t border-border/30"></div>
                <div className="absolute top-1/2 left-0 right-0 border-t border-border/30"></div>
                <div className="absolute bottom-0 left-0 right-0 border-t border-border/30"></div>
              </div>

              {/* Lines */}
              <svg className="absolute inset-0 h-full w-full">
                {rebasedData.map((stock: any, idx: number) => {
                  const points = stock.rebased
                    .filter((p: any) => p.value !== null)
                    .map((p: any, i: number) => {
                      const x = (i / (stock.rebased.length - 1)) * 100;
                      const y = 100 - ((p.value! - yRange.min) / (yRange.max - yRange.min)) * 100;
                      return `${x},${y}`;
                    })
                    .join(" ");

                  return (
                    <polyline
                      key={stock.symbol}
                      fill="none"
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth="2"
                      points={points}
                    />
                  );
                })}
              </svg>

              {/* Legend */}
              <div className="absolute bottom-2 right-2 flex flex-wrap gap-3 text-xs">
                {rebasedData.map((stock: any, idx: number) => (
                  <span key={stock.symbol} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: COLORS[idx % COLORS.length] }}
                    />
                    {stock.symbol}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signal Comparison Table */}
      {compare.data?.symbols && compare.data.symbols.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-bold font-space">Signal Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left text-muted font-space">Signal</th>
                  {compare.data.symbols.map(stock => (
                    <th key={stock.symbol} className="py-2 text-center font-space">
                      {stock.symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2 text-muted">Momentum Score</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.momentum !== null && stock.signals.momentum !== undefined
                        ? stock.signals.momentum.toFixed(2)
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2 text-muted">Smart Money</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.smartMoney !== null && stock.signals.smartMoney !== undefined
                        ? stock.signals.smartMoney.toFixed(2)
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2 text-muted">Volume Z-Score</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.volumeZ !== null && stock.signals.volumeZ !== undefined
                        ? stock.signals.volumeZ.toFixed(2)
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2 text-muted">CMF</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.cmf !== null && stock.signals.cmf !== undefined
                        ? stock.signals.cmf.toFixed(3)
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2 text-muted">MFI</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.mfi !== null && stock.signals.mfi !== undefined
                        ? stock.signals.mfi.toFixed(2)
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 text-muted">Order Flow</td>
                  {compare.data.symbols.map(stock => (
                    <td key={stock.symbol} className="py-2 text-center font-mono">
                      {stock.signals.orderFlow ?? "—"}
                      {stock.signals.orderFlow && (
                        <span className="ml-1 text-[9px] text-muted">(est.)</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
