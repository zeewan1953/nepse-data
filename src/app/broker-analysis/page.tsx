"use client";
import { useState, useMemo } from "react";
import { usePoll } from "@/lib/useLive";
import "./broker-analysis.css";

// Types
type DateOverview = {
  date: string;
  totals: { trades: number; qty: number; amount: number; brokers: number; stocks: number };
  netFlow: Array<{ id: string; buyAmt: number; sellAmt: number; netAmt: number }>;
  dates: string[];
};

type AccDistData = {
  date: string;
  stocks: Array<{
    symbol: string;
    name: string;
    buyAmt: number;
    sellAmt: number;
    netFlow: number;
    signal: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
  }>;
  totals: {
    totalAccumulation: number;
    totalDistribution: number;
    accumulated: number;
    distributed: number;
    neutral: number;
  };
};

type BrokerData = {
  date: string;
  broker: string;
  stocks: Array<{
    symbol: string;
    buyQty: number;
    buyAmt: number;
    sellQty: number;
    sellAmt: number;
    netQty: number;
    netAmt: number;
    aggressive: "buy" | "sell" | "mixed";
  }>;
  totals: {
    buyAmt: number;
    sellAmt: number;
    netAmt: number;
  };
};

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

function formatCr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (abs >= 1e5) return (n / 1e5).toFixed(1) + " L";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return n.toFixed(0);
}

export default function BrokerAnalysisPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [brokerFilter, setBrokerFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [activeBroker, setActiveBroker] = useState<string | null>(null);

  // Fetch data
  const dateData = usePoll<DateOverview>(`/api/fs-date?date=${selectedDate}`, 30_000);
  const accDistData = usePoll<AccDistData>(`/api/accumulation?date=${selectedDate}`, 30_000);
  const brokerData = usePoll<BrokerData>(
    activeBroker ? `/api/fs-broker?date=${selectedDate}&broker=${activeBroker}` : "",
    30_000
  );

  const availableDates = dateData.data?.dates || [];
  const hasData = dateData.data && dateData.data.totals.trades > 0;

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    if (!accDistData.data?.stocks) return [];
    if (!stockFilter) return accDistData.data.stocks.slice(0, 24);
    const q = stockFilter.toLowerCase();
    return accDistData.data.stocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
      .slice(0, 24);
  }, [accDistData.data, stockFilter]);

  const topAccumulation = filteredStocks.filter((s) => s.netFlow > 0).slice(0, 10);
  const topDistribution = filteredStocks.filter((s) => s.netFlow < 0).sort((a, b) => a.netFlow - b.netFlow).slice(0, 10);
  const topBrokers = dateData.data?.netFlow?.slice(0, 20) || [];

  return (
    <div className="ba-page">
      {/* Header */}
      <header className="ba-header">
        <div className="ba-logo">
          <i className="fas fa-chart-line" />
          BROKER ANALYSIS
        </div>
        <div className="ba-subtitle">Dari Sir - Institutional Flow Tracker</div>
      </header>

      {/* Date & Stats */}
      <section className="ba-date-section">
        <div className="ba-date-card">
          <div className="ba-date-label">Select Date</div>
          <div className="ba-date-input">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={todayStr()}
            />
            <div className="ba-date-status">
              <div className="status">
                <span className={`dot ${hasData ? "" : "closed"}`} />
                {hasData ? "Data Available" : "No Data"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ba-text-dim)" }}>
                {availableDates.length} trading days synced
              </div>
            </div>
          </div>
        </div>

        <div className="ba-date-card">
          <div className="ba-date-label">Quick Stats - {selectedDate}</div>
          <div className="ba-quick-stats">
            <div className="ba-stat-box">
              <div className="label">Turnover</div>
              <div className="value gold">{hasData ? formatCr(dateData.data!.totals.amount) : "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Trades</div>
              <div className="value blue">{hasData ? dateData.data!.totals.trades.toLocaleString() : "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Brokers</div>
              <div className="value">{hasData ? dateData.data!.totals.brokers : "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Stocks</div>
              <div className="value">{hasData ? dateData.data!.totals.stocks : "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Accumulated</div>
              <div className="value green">{accDistData.data?.totals.accumulated ?? "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Distributed</div>
              <div className="value red">{accDistData.data?.totals.distributed ?? "—"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Search Filters */}
      <section className="ba-filter-section">
        <div className="ba-filter-row">
          <input
            type="text"
            className="ba-filter-input"
            placeholder="Broker Number (e.g., 49)"
            value={brokerFilter}
            onChange={(e) => setBrokerFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && brokerFilter && setActiveBroker(brokerFilter)}
          />
          <input
            type="text"
            className="ba-filter-input"
            placeholder="Stock Symbol (e.g., NABIL)"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          />
          <button className="ba-filter-btn" onClick={() => brokerFilter && setActiveBroker(brokerFilter)}>
            <i className="fas fa-search" /> Search
          </button>
        </div>
      </section>

      {/* Loading */}
      {dateData.loading && !dateData.data && (
        <div className="ba-loading">
          <div className="ba-spinner" />
          <div>Loading floorsheet data...</div>
        </div>
      )}

      {/* Empty State */}
      {!dateData.loading && !hasData && (
        <div className="ba-empty">
          <i className="fas fa-calendar-xmark" />
          <div className="empty-title">No data available for {selectedDate}</div>
          <div className="empty-sub">Try selecting a different date or sync floorsheet data first</div>
        </div>
      )}

      {/* Main Content */}
      {hasData && (
        <>
          {/* Top Accumulation / Distribution */}
          <section className="ba-acc-dist-grid">
            <div className="ba-acc-card">
              <div className="title">
                <i className="fas fa-arrow-trend-up" /> Top Accumulation
              </div>
              {topAccumulation.length > 0 ? (
                topAccumulation.map((s, i) => (
                  <div key={i} className="ba-acc-item">
                    <span className="symbol">{s.symbol}</span>
                    <span className="amount">+{formatCr(s.netFlow)}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--ba-text-muted)", textAlign: "center", padding: 20 }}>
                  No accumulation data
                </div>
              )}
            </div>

            <div className="ba-dist-card">
              <div className="title">
                <i className="fas fa-arrow-trend-down" /> Top Distribution
              </div>
              {topDistribution.length > 0 ? (
                topDistribution.map((s, i) => (
                  <div key={i} className="ba-dist-item">
                    <span className="symbol">{s.symbol}</span>
                    <span className="amount">{formatCr(s.netFlow)}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--ba-text-muted)", textAlign: "center", padding: 20 }}>
                  No distribution data
                </div>
              )}
            </div>
          </section>

          {/* Broker Flow Table */}
          <section className="ba-broker-section">
            <div className="ba-section-title">
              <i className="fas fa-building" /> Broker Flow Analysis
              <span style={{ fontSize: 11, color: "var(--ba-text-muted)", marginLeft: "auto", fontWeight: 400 }}>
                Click broker to view details
              </span>
            </div>
            <table className="ba-table">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Buy Amount</th>
                  <th>Sell Amount</th>
                  <th>Net Position</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {topBrokers.map((b) => (
                  <tr
                    key={b.id}
                    className={activeBroker === b.id ? "selected" : ""}
                    onClick={() => setActiveBroker(b.id === activeBroker ? null : b.id)}
                  >
                    <td className="broker-id">#{b.id}</td>
                    <td>{formatCr(b.buyAmt)}</td>
                    <td>{formatCr(b.sellAmt)}</td>
                    <td className={b.netAmt >= 0 ? "positive" : "negative"}>
                      {b.netAmt >= 0 ? "+" : ""}{formatCr(b.netAmt)}
                    </td>
                    <td>
                      {b.netAmt > 0 ? (
                        <span style={{ color: "var(--ba-green)" }}><i className="fas fa-arrow-up" /> Buying</span>
                      ) : b.netAmt < 0 ? (
                        <span style={{ color: "var(--ba-red)" }}><i className="fas fa-arrow-down" /> Selling</span>
                      ) : (
                        <span style={{ color: "var(--ba-blue)" }}><i className="fas fa-minus" /> Neutral</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Active Broker Details */}
          {activeBroker && brokerData.data && brokerData.data.stocks.length > 0 && (
            <section className="ba-broker-section">
              <div className="ba-section-title">
                <i className="fas fa-user-tie" /> Broker #{activeBroker} Details
                <span style={{ fontSize: 11, color: "var(--ba-text-muted)", marginLeft: "auto", fontWeight: 400 }}>
                  Buy: {formatCr(brokerData.data.totals.buyAmt)} | Sell: {formatCr(brokerData.data.totals.sellAmt)} | Net: {formatCr(brokerData.data.totals.netAmt)}
                </span>
              </div>
              <table className="ba-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Buy Qty</th>
                    <th>Buy Amt</th>
                    <th>Sell Qty</th>
                    <th>Sell Amt</th>
                    <th>Net</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerData.data.stocks.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.symbol}</td>
                      <td>{s.buyQty.toLocaleString()}</td>
                      <td>{formatCr(s.buyAmt)}</td>
                      <td>{s.sellQty.toLocaleString()}</td>
                      <td>{formatCr(s.sellAmt)}</td>
                      <td className={s.netAmt >= 0 ? "positive" : "negative"}>
                        {s.netAmt >= 0 ? "+" : ""}{formatCr(s.netAmt)}
                      </td>
                      <td>
                        {s.aggressive === "buy" ? (
                          <span style={{ color: "var(--ba-green)", fontSize: 11, fontWeight: 700 }}>AGGRESSIVE BUY</span>
                        ) : s.aggressive === "sell" ? (
                          <span style={{ color: "var(--ba-red)", fontSize: 11, fontWeight: 700 }}>AGGRESSIVE SELL</span>
                        ) : (
                          <span style={{ color: "var(--ba-blue)", fontSize: 11, fontWeight: 700 }}>MIXED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Stock Acc/Dist Grid */}
          <section className="ba-stock-section">
            <div className="ba-section-title">
              <i className="fas fa-chart-bar" /> Stock Accumulation / Distribution
            </div>
            <div className="ba-stock-grid">
              {filteredStocks.slice(0, 12).map((s, i) => (
                <div key={i} className="ba-stock-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div className="symbol">{s.symbol}</div>
                    <span className={`signal ${s.signal.toLowerCase()}`}>
                      {s.signal}
                    </span>
                  </div>
                  <div className="details">
                    <div>
                      <div className="label">Buy Amt</div>
                      <div className="value" style={{ color: "var(--ba-green)" }}>{formatCr(s.buyAmt)}</div>
                    </div>
                    <div>
                      <div className="label">Sell Amt</div>
                      <div className="value" style={{ color: "var(--ba-red)" }}>{formatCr(s.sellAmt)}</div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div className="label">Net Flow</div>
                      <div className="value" style={{ color: s.netFlow >= 0 ? "var(--ba-green)" : "var(--ba-red)" }}>
                        {s.netFlow >= 0 ? "+" : ""}{formatCr(s.netFlow)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
