"use client";

import { useEffect, useState, useCallback } from "react";
import { INDICATOR_META, type IndicatorMeta } from "@/lib/indicators-meta";

interface IndicatorRow {
  symbol: string;
  indicatorName: string;
  rawValue: number | null;
  signal: string | null;
}

type SortKey = "symbol" | "signal" | "indicator";

export default function IndicatorsPage() {
  const [date, setDate] = useState<string>("");
  const [stocks, setStocks] = useState<string[]>([]);
  const [data, setData] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbolInput, setSymbolInput] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("indicator");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async (symbols?: string[]) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (symbols && symbols.length) params.set("symbols", symbols.join(","));
      const res = await fetch(`/api/indicators/matrix?${params}`);
      const json = await res.json();
      if (json.date) setDate(json.date);
      setStocks(json.stocks || []);
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addSymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (s && !stocks.includes(s)) {
      const newSymbols = [...stocks, s];
      fetchData(newSymbols);
      setSymbolInput("");
    }
  };

  const removeSymbol = (sym: string) => {
    const newSymbols = stocks.filter(x => x !== sym);
    fetchData(newSymbols.length ? newSymbols : undefined);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Build lookup: indicatorName -> symbol -> { rawValue, signal }
  const lookup = new Map<string, Map<string, IndicatorRow>>();
  for (const row of data) {
    if (!lookup.has(row.indicatorName)) lookup.set(row.indicatorName, new Map());
    lookup.get(row.indicatorName)!.set(row.symbol, row);
  }

  const sortedMeta = [...INDICATOR_META].sort((a, b) => {
    let cmp = a.label.localeCompare(b.label);
    if (sortKey === "symbol") cmp = 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const signalBadge = (signal: string | null, indicatorName: string, rawValue: number | null) => {
    const isNull = signal === null;
    const isNeutral = signal === "NEUTRAL";
    const isBuy = signal === "BUY";
    const isSell = signal === "SELL";
    const isEst = indicatorName === "order_flow_est";

    if (isNull) return <span className="cell-muted">—</span>;
    if (isNeutral) return <span className="cell-neutral">NEUTRAL</span>;

    const label = isBuy ? "BUY" : "SELL";
    const cls = isBuy ? "cell-buy" : "cell-sell";
    const estSuffix = isEst ? " (est.)" : "";

    return (
      <span className={cls}>
        {label}{estSuffix}
        <span className="cell-value">{rawValue?.toLocaleString()}</span>
      </span>
    );
  };

  return (
    <div className="indicators-page">
      {/* Header */}
      <div className="indicators-header">
        <div>
          <h1 className="indicators-title">Technical Indicator Matrix</h1>
          <div className="indicators-subtitle">
            <span className="badge-daily">Daily timeframe</span>
            {date && <span className="indicators-date">{date}</span>}
          </div>
        </div>
        <div className="indicators-controls">
          <div className="symbol-input-group">
            <input
              value={symbolInput}
              onChange={e => setSymbolInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addSymbol()}
              placeholder="Add symbol..."
              className="symbol-input"
            />
            <button onClick={addSymbol} className="btn-sm">+</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="legend">
        <span><span className="dot dot-buy" /> BUY</span>
        <span><span className="dot dot-sell" /> SELL</span>
        <span><span className="dot dot-neutral" /> NEUTRAL</span>
        <span><span className="dot dot-muted" /> No data</span>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-box">
        Technical indicators are based on historical data and formulas. Not financial advice.
        Past patterns do not guarantee future results.
      </div>

      {/* Matrix Table */}
      {loading ? (
        <div className="loading">Loading indicators...</div>
      ) : stocks.length === 0 ? (
        <div className="empty-state">No indicator data yet. Run <code>scripts/compute_indicators.py</code> first.</div>
      ) : (
        <div className="matrix-wrapper">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="th-indicator" onClick={() => toggleSort("indicator")}>
                  Indicator {sortKey === "indicator" && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
                {stocks.map(sym => (
                  <th key={sym} className="th-stock">
                    {sym}
                    <button className="btn-remove" onClick={() => removeSymbol(sym)} title="Remove">×</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMeta.map(meta => {
                const col = lookup.get(meta.name);
                return (
                  <tr key={meta.name}>
                    <td className="td-indicator" title={meta.description}>
                      <span className="indicator-label">{meta.label}</span>
                    </td>
                    {stocks.map(sym => {
                      const row = col?.get(sym);
                      return (
                        <td key={sym} className="td-cell">
                          {signalBadge(row?.signal ?? null, meta.name, row?.rawValue ?? null)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .indicators-page {
          padding: 16px;
          color: #e0e0e0;
          max-width: 100%;
          overflow-x: auto;
        }
        .indicators-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
        }
        .indicators-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          color: #fff;
        }
        .indicators-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .badge-daily {
          background: #1a3a5c;
          color: #8ab4f8;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid #2a5a8c;
        }
        .indicators-date {
          color: #999;
          font-size: 13px;
        }
        .indicators-controls {
          display: flex;
          gap: 8px;
        }
        .symbol-input-group {
          display: flex;
          gap: 4px;
        }
        .symbol-input {
          background: #1a1a2e;
          border: 1px solid #333;
          color: #e0e0e0;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 13px;
          width: 120px;
        }
        .symbol-input:focus {
          outline: none;
          border-color: #0044ff;
        }
        .btn-sm {
          background: #0044ff;
          color: #fff;
          border: none;
          border-radius: 4px;
          padding: 4px 12px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn-sm:hover {
          background: #0033cc;
        }
        .legend {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #aaa;
          margin-bottom: 10px;
        }
        .dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 4px;
        }
        .dot-buy { background: #00cc44; }
        .dot-sell { background: #e60000; }
        .dot-neutral { background: #666; }
        .dot-muted { background: #333; }
        .disclaimer-box {
          background: #1a1a00;
          border: 1px solid #664400;
          color: #cc9900;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 12px;
        }
        .loading, .empty-state {
          color: #888;
          padding: 40px;
          text-align: center;
        }
        .empty-state code {
          background: #222;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 12px;
        }
        .matrix-wrapper {
          overflow-x: auto;
          border: 1px solid #222;
          border-radius: 6px;
        }
        .matrix-table {
          border-collapse: collapse;
          width: 100%;
          min-width: 600px;
          font-size: 12px;
          background: #0d0d1a;
        }
        .matrix-table th, .matrix-table td {
          border: 1px solid #1a1a2e;
          padding: 6px 10px;
          text-align: center;
          white-space: nowrap;
        }
        .th-indicator {
          background: #111122;
          color: #8ab4f8;
          text-align: left;
          cursor: pointer;
          position: sticky;
          left: 0;
          z-index: 2;
          min-width: 160px;
        }
        .th-stock {
          background: #111122;
          color: #ccc;
          font-weight: 600;
          min-width: 90px;
        }
        .btn-remove {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          margin-left: 4px;
          font-size: 14px;
          padding: 0 2px;
        }
        .btn-remove:hover { color: #e60000; }
        .td-indicator {
          background: #0d0d1a;
          text-align: left;
          position: sticky;
          left: 0;
          z-index: 1;
        }
        .indicator-label {
          color: #ddd;
          font-size: 12px;
        }
        .td-cell {
          background: #0d0d1a;
        }
        .cell-buy {
          color: #00cc44;
          font-weight: 600;
        }
        .cell-sell {
          color: #e60000;
          font-weight: 600;
        }
        .cell-neutral {
          color: #888;
          font-size: 11px;
        }
        .cell-muted {
          color: #444;
        }
        .cell-value {
          display: block;
          font-size: 10px;
          color: #666;
          font-weight: 400;
        }
      `}</style>
    </div>
  );
}
