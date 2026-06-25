"use client";
import { useState, useMemo } from "react";
import { usePoll } from "@/lib/useLive";

type StockHolding = {
  brokerId: string; stockSymbol: string;
  buyQty: number; buyAmt: number; sellQty: number; sellAmt: number;
  netQty: number; netAmt: number;
  cumulativeNetQty: number | null; cumulativeNetAmt: number | null;
};

type BrokerSummary = {
  brokerId: string; buyAmt: number; sellAmt: number; netAmt: number;
  buyQty: number; sellQty: number;
};

type ApiResponse = {
  date: string; source?: string; brokers: string[]; stocks: StockHolding[];
  totalStocks: number; dates: string[]; brokerSummary: BrokerSummary[];
};

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(1) + " L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return n.toFixed(0);
}

export default function HoldingPage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedBroker, setSelectedBroker] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (selectedDate) p.set("date", selectedDate);
    if (selectedBroker) p.set("broker", selectedBroker);
    return `/api/broker-stocks?${p}`;
  }, [selectedDate, selectedBroker]);

  const { data, loading, updatedAt } = usePoll<ApiResponse>(apiUrl, 600_000);

  const dates = data?.dates ?? [];
  const effectiveDate = selectedDate || dates[0] || "";
  const filteredStocks = (data?.stocks ?? []).filter((s) =>
    s.stockSymbol.toLowerCase().includes(stockFilter.toLowerCase())
  );
  const summary = data?.brokerSummary ?? [];

  const topSummary = summary.slice(0, 10);
  const maxAbsSummary = Math.max(...topSummary.map((x) => Math.abs(x.netAmt)), 1);

  return (
    <div className="holding-page">
      <style>{`
        .holding-page { padding: 20px; max-width: 1400px; margin: 0 auto; color: #e0e0e0; font-family: 'Space Grotesk', sans-serif; }
        .holding-page h1 { color: #d4af37; font-size: 1.5rem; margin-bottom: 4px; }
        .holding-page .sub { color: #8899aa; font-size: 0.8rem; margin-bottom: 16px; }
        .holding-filters { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .holding-filters select, .holding-filters input {
          background: #11192b; color: #e0e0e0; border: 1px solid #232c42; border-radius: 6px;
          padding: 8px 12px; font-size: 0.85rem; font-family: inherit;
        }
        .holding-filters select:focus, .holding-filters input:focus { outline: none; border-color: #d4af37; }
        .holding-filters label { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #8899aa; }
        .holding-filters .updated { font-size: 0.75rem; color: #556; margin-left: auto; }

        .holding-stats { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
        .holding-stat { background: #11192b; border: 1px solid #232c42; border-radius: 8px; padding: 12px 16px; }
        .holding-stat-label { font-size: 0.75rem; color: #8899aa; text-transform: uppercase; }
        .holding-stat-value { font-size: 1.1rem; color: #d4af37; font-family: 'IBM Plex Mono', monospace; margin-top: 4px; }

        .chart-section { background: #11192b; border: 1px solid #232c42; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        .chart-section .chart-title { color: #d4af37; font-size: 0.95rem; margin-bottom: 12px; }
        .diverging-bar-chart { display: flex; flex-direction: column; gap: 6px; }
        .diverging-bar-row { display: flex; align-items: center; gap: 8px; height: 28px; }
        .diverging-bar-row .bar-label { width: 40px; font-size: 0.78rem; color: #d4af37; font-family: 'IBM Plex Mono', monospace; text-align: right; flex-shrink: 0; }
        .diverging-bar-row .bar-track { flex: 1; display: flex; height: 18px; background: #0a0e16; border-radius: 3px; overflow: hidden; }
        .diverging-bar-row .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; min-width: 2px; }
        .diverging-bar-row .bar-fill.positive { background: #22c55e; }
        .diverging-bar-row .bar-fill.negative { background: #ef4444; }
        .diverging-bar-row .bar-spacer { flex: 1; }
        .diverging-bar-row .bar-value { width: 80px; font-size: 0.78rem; color: #e0e0e0; font-family: 'IBM Plex Mono', monospace; text-align: right; flex-shrink: 0; }

        .holding-table-wrap { overflow-x: auto; }
        .holding-table {
          width: 100%; border-collapse: collapse; font-size: 0.82rem;
          background: #0a0e16; border: 1px solid #232c42; border-radius: 8px; overflow: hidden;
        }
        .holding-table th {
          background: #11192b; color: #8899aa; font-weight: 500; padding: 10px 12px;
          text-align: right; border-bottom: 1px solid #232c42; white-space: nowrap;
        }
        .holding-table th:first-child { text-align: left; }
        .holding-table td {
          padding: 8px 12px; text-align: right; border-bottom: 1px solid #1a2340;
          font-family: 'IBM Plex Mono', monospace; white-space: nowrap;
        }
        .holding-table td:first-child, .holding-table td:nth-child(2) { text-align: left; font-family: 'Space Grotesk', sans-serif; color: #d4af37; font-weight: 500; }
        .holding-table tr:hover { background: #11192b; }
        .pos { color: #22c55e; }
        .neg { color: #ef4444; }
        .zero { color: #0ea5e9; }
        .loading { text-align: center; padding: 40px; color: #8899aa; }
      `}</style>

      <h1>Broker Stock Holdings</h1>
      <div className="sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Per-broker per-stock accumulation — auto-refreshes every 10 min
        {data?.source === "merolagani" && (
          <span style={{ background: "#1e3a5f", color: "#60a5fa", padding: "2px 8px", borderRadius: 4, fontSize: "0.7rem", fontWeight: 600 }}>
            ⚡ MeroLagani Live
          </span>
        )}
      </div>

      <div className="holding-filters">
        <label>
          Date:
          <select value={effectiveDate} onChange={(e) => setSelectedDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Broker:
          <select value={selectedBroker} onChange={(e) => setSelectedBroker(e.target.value)}>
            <option value="">All Brokers</option>
            {data?.brokers.map((b) => (
              <option key={b} value={b}>#{b}</option>
            ))}
          </select>
        </label>
        <label>
          Stock:
          <input type="text" placeholder="Filter by symbol..." value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)} />
        </label>
        {updatedAt && (
          <span className="updated">Last updated: {new Date(updatedAt).toLocaleTimeString()}</span>
        )}
      </div>

      {data && (
        <div className="holding-stats">
          <div className="holding-stat">
            <div className="holding-stat-label">Date</div>
            <div className="holding-stat-value">{data.date}</div>
          </div>
          <div className="holding-stat">
            <div className="holding-stat-label">Broker-Stock Pairs</div>
            <div className="holding-stat-value">{data.totalStocks.toLocaleString()}</div>
          </div>
          <div className="holding-stat">
            <div className="holding-stat-label">Brokers</div>
            <div className="holding-stat-value">{data.brokers.length}</div>
          </div>
        </div>
      )}

      {/* Bar chart */}
      {summary.length > 0 && (
        <div className="chart-section">
          <div className="chart-title">Top 10 Brokers by Net Position</div>
          <div className="diverging-bar-chart">
            {topSummary.map((b) => {
              const pct = (Math.abs(b.netAmt) / maxAbsSummary) * 100;
              return (
                <div key={b.brokerId} className="diverging-bar-row">
                  <div className="bar-label">#{b.brokerId}</div>
                  <div className="bar-track">
                    {b.netAmt >= 0 ? (
                      <>
                        <div className="bar-fill positive" style={{ width: `${pct}%` }} />
                        <div className="bar-spacer" />
                      </>
                    ) : (
                      <>
                        <div className="bar-spacer" />
                        <div className="bar-fill negative" style={{ width: `${pct}%` }} />
                      </>
                    )}
                  </div>
                  <div className="bar-value">
                    {b.netAmt > 0 ? "+" : ""}{fmt(b.netAmt)} | Buy {fmt(b.buyAmt)} / Sell {fmt(b.sellAmt)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="holding-table-wrap">
          <table className="holding-table">
            <thead>
              <tr>
                <th>Broker</th>
                <th>Stock</th>
                <th>Buy Qty</th>
                <th>Buy Amt</th>
                <th>Sell Qty</th>
                <th>Sell Amt</th>
                <th>Net Qty</th>
                <th>Net Amt</th>
                <th>Cum Net Qty</th>
                <th>Cum Net Amt</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "#8899aa", padding: 20 }}>No data for this selection</td></tr>
              ) : filteredStocks.map((s, i) => (
                <tr key={`${s.brokerId}-${s.stockSymbol}-${i}`}>
                  <td>#{s.brokerId}</td>
                  <td>{s.stockSymbol}</td>
                  <td className="pos">{s.buyQty.toLocaleString()}</td>
                  <td className="pos">{fmt(s.buyAmt)}</td>
                  <td className="neg">{s.sellQty.toLocaleString()}</td>
                  <td className="neg">{fmt(s.sellAmt)}</td>
                  <td className={s.netQty > 0 ? "pos" : s.netQty < 0 ? "neg" : "zero"}>{s.netQty.toLocaleString()}</td>
                  <td className={s.netAmt > 0 ? "pos" : s.netAmt < 0 ? "neg" : "zero"}>{fmt(s.netAmt)}</td>
                  <td className={s.cumulativeNetQty !== null ? (s.cumulativeNetQty > 0 ? "pos" : s.cumulativeNetQty < 0 ? "neg" : "zero") : ""}>
                    {s.cumulativeNetQty !== null ? s.cumulativeNetQty.toLocaleString() : "—"}
                  </td>
                  <td className={s.cumulativeNetAmt !== null ? (s.cumulativeNetAmt > 0 ? "pos" : s.cumulativeNetAmt < 0 ? "neg" : "zero") : ""}>
                    {s.cumulativeNetAmt !== null ? fmt(s.cumulativeNetAmt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
