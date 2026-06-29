"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { INDICATOR_META } from "@/lib/indicators-meta";

interface IndicatorRow {
  symbol: string;
  indicatorName: string;
  rawValue: number | null;
  signal: string | null;
}

export default function IndicatorsPage() {
  const [date, setDate] = useState<string>("");
  const [data, setData] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/indicators/matrix");
      const json = await res.json();
      if (json.date) setDate(json.date);
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const indicatorMap = new Map<string, string[]>();
  for (const meta of INDICATOR_META) indicatorMap.set(meta.name, []);
  for (const row of data) {
    if (row.signal === "BUY") {
      const arr = indicatorMap.get(row.indicatorName);
      if (arr && arr.length < 5) arr.push(row.symbol);
    }
  }

  const indicators = INDICATOR_META.map(meta => ({ meta, buys: indicatorMap.get(meta.name) || [] }));

  return (
    <div className="indicators-page">
      <div className="indicators-header">
        <div>
          <h1 className="indicators-title">Indicator Signals — BUY</h1>
          <div className="indicators-subtitle">
            <span className="badge-daily">Daily timeframe</span>
            {date && <span className="indicators-date">{date}</span>}
            <span className="indicators-count">max 5 stocks per indicator</span>
          </div>
        </div>
      </div>

      <div className="disclaimer-box">
        Technical indicators are based on historical data and formulas. Not financial advice.
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="table-wrap">
          <table className="indicator-table">
            <thead>
              <tr>
                <th className="th-indicator">Indicator</th>
                <th className="th-stocks">Stocks (BUY)</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map(({ meta, buys }, i) => (
                <tr key={meta.name} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                  <td className="td-label">{meta.label}</td>
                  <td className="td-stocks">
                    {buys.length > 0 ? (
                      <div className="tag-group">
                        {buys.map(sym => (
                          <Link key={sym} href={`/stock/${sym}`} className="buy-tag">{sym}</Link>
                        ))}
                      </div>
                    ) : (
                      <span className="no-signal">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .indicators-page { padding: 16px; color: #e0e0e0; max-width: 800px; margin: 0 auto; }
        .indicators-header { margin-bottom: 8px; }
        .indicators-title { font-size: 15px; font-weight: 700; margin: 0; color: #fff; }
        .indicators-subtitle { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
        .badge-daily { background: #1a3a5c; color: #8ab4f8; font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid #2a5a8c; }
        .indicators-date { color: #999; font-size: 13px; }
        .indicators-count { color: #00cc44; font-size: 12px; }
        .disclaimer-box { background: #1a1a00; border: 1px solid #664400; color: #cc9900; padding: 8px 12px; border-radius: 4px; font-size: 12px; margin-bottom: 12px; }
        .loading { color: #888; padding: 40px; text-align: center; }
        .table-wrap { overflow-x: auto; border: 1px solid #1a1a2e; border-radius: 8px; }
        .indicator-table { width: 100%; border-collapse: collapse; font-size: 12px; background: #0a0a16; }
        .indicator-table th { padding: 6px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #556; background: #0f0f1e; border-bottom: 1px solid #1a1a2e; }
        .indicator-table td { padding: 4px 10px; }
        .row-even { background: #0a0a16; }
        .row-odd { background: #0e0e1c; }
        .td-label { color: #7aa8f0; font-weight: 600; font-size: 11px; min-width: 130px; white-space: nowrap; }
        .tag-group { display: flex; flex-wrap: wrap; gap: 3px; }
        .buy-tag { display: inline-block; background: #002211; color: #00cc44; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 3px; border: 1px solid #004422; text-decoration: none; transition: 0.12s; }
        .buy-tag:hover { background: #003322; border-color: #008844; }
        .no-signal { color: #333; font-size: 11px; }
      `}</style>
    </div>
  );
}
