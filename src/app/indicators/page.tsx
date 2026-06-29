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

  // Group by indicator, collect BUY symbols (max 5 each)
  const indicatorMap = new Map<string, { meta: typeof INDICATOR_META[number]; buys: string[] }>();
  for (const meta of INDICATOR_META) {
    indicatorMap.set(meta.name, { meta, buys: [] });
  }
  for (const row of data) {
    if (row.signal === "BUY") {
      const entry = indicatorMap.get(row.indicatorName);
      if (entry && entry.buys.length < 5) {
        entry.buys.push(row.symbol);
      }
    }
  }

  const indicators = [...indicatorMap.values()];

  return (
    <div className="indicators-page">
      <div className="indicators-header">
        <div>
          <h1 className="indicators-title">Indicator Signals — BUY</h1>
          <div className="indicators-subtitle">
            <span className="badge-daily">Daily timeframe</span>
            {date && <span className="indicators-date">{date}</span>}
            <span className="indicators-count">BUY signals shown · max 5 per indicator</span>
          </div>
        </div>
      </div>

      <div className="disclaimer-box">
        Technical indicators are based on historical data and formulas. Not financial advice.
        Past patterns do not guarantee future results.
      </div>

      {loading ? (
        <div className="loading">Loading indicators...</div>
      ) : (
        <div className="card-list">
          {indicators.map(({ meta, buys }) => (
            <div key={meta.name} className="indicator-card">
              <div className="card-label">{meta.label}</div>
              <div className="card-symbols">
                {buys.length > 0 ? buys.map(sym => (
                  <Link key={sym} href={`/stock/${sym}`} className="symbol-tag">{sym}</Link>
                )) : <span className="no-buy">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .indicators-page {
          padding: 16px;
          color: #e0e0e0;
          max-width: 800px;
          margin: 0 auto;
        }
        .indicators-header {
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
          flex-wrap: wrap;
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
        .indicators-count {
          color: #00cc44;
          font-size: 12px;
        }
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
        .card-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .indicator-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #0d0d1a;
          border: 1px solid #1a1a2e;
          border-radius: 6px;
          padding: 10px 14px;
        }
        .card-label {
          color: #8ab4f8;
          font-size: 12px;
          font-weight: 600;
          min-width: 150px;
          flex-shrink: 0;
        }
        .card-symbols {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .symbol-tag {
          background: #002211;
          color: #00cc44;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 4px;
          border: 1px solid #004422;
          text-decoration: none;
          transition: background 0.15s;
        }
        .symbol-tag:hover {
          background: #003322;
          border-color: #008844;
        }
        .no-buy {
          color: #444;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
