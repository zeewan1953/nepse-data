"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { usePoll } from "@/lib/useLive";
import { computeBrokerFootprint, getBestFlowSummary, patternLabel, patternColor } from "@/lib/broker-footprint";
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

type HoldingData = {
  date: string;
  status: "finalized" | "pending" | "empty";
  brokers: Array<{
    brokerId: string;
    buyAmt: number;
    sellAmt: number;
    netAmt: number;
    cumulativeNet: number | null;
    holdingPct: number | null;
    note: string | null;
    rank: number;
  }>;
  totalBuyAmt: number;
  totalSellAmt: number;
  totalNetAmt: number;
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

// Footprint data type
type FootprintData = {
  brokerCode: string;
  symbol: string;
  windowDays: number;
  status: string;
  dailyNet: Array<{ date: string; netQty: number }>;
  footprint: {
    cumulativeNet: number;
    streakLength: number;
    streakDirection: number | null;
    flips: number;
    pattern: string;
    windowDays: number;
  } | null;
};

export default function BrokerAnalysisPage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [brokerFilter, setBrokerFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [activeBroker, setActiveBroker] = useState<string | null>(null);
  const [footprintSymbol, setFootprintSymbol] = useState<string | null>(null);
  const [brokerFlowFilter, setBrokerFlowFilter] = useState("");
  useEffect(() => { setBrokerFlowFilter(""); }, [footprintSymbol]);

  // Bootstrap: fetch latest available date on mount
  const latestDate = usePoll<{ date: string; dates: string[] }>("/api/fs-date?date=", 0);
  useEffect(() => {
    if (!bootstrapped && latestDate.data?.date) {
      setSelectedDate(latestDate.data.date);
      setBootstrapped(true);
    }
  }, [latestDate.data?.date, bootstrapped]);

  // Fetch data — usePoll is always called (rules of hooks), URL changes trigger refetch
  const dateData = usePoll<DateOverview>(selectedDate ? `/api/fs-date?date=${selectedDate}` : "", 0);
  const accDistData = usePoll<AccDistData>(selectedDate ? `/api/accumulation?date=${selectedDate}` : "", 0);
  const brokerData = usePoll<BrokerData>(
    activeBroker && selectedDate ? `/api/fs-broker?date=${selectedDate}&broker=${activeBroker}` : "",
    0
  );
  const holdingData = usePoll<HoldingData>(selectedDate ? `/api/broker-holding?date=${selectedDate}` : "", 0);
  const footprintData = usePoll<FootprintData>(
    footprintSymbol && selectedDate ? `/api/broker-flow/${footprintSymbol}/${selectedDate}` : "",
    0
  );

  // Compute best flow summary from footprint data
  const bestFlowSummary = useMemo(() => {
    if (!footprintData.data?.dailyNet || footprintData.data.dailyNet.length === 0) return null;
    return computeBrokerFootprint(footprintData.data.dailyNet);
  }, [footprintData.data]);

  const availableDates = dateData.data?.dates || [];
  const hasData = dateData.data && dateData.data.totals.trades > 0;

  // Filtered stocks - signals first, then by buy volume
  const filteredStocks = useMemo(() => {
    if (!accDistData.data?.stocks) return [];
    let items = accDistData.data.stocks;
    if (stockFilter) {
      const q = stockFilter.toLowerCase();
      items = items.filter((s) => s.symbol.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q));
    }
    // Signal stocks first, then by total traded value
    return items.sort((a, b) => {
      const aSig = a.signal !== "NEUTRAL" ? 1 : 0;
      const bSig = b.signal !== "NEUTRAL" ? 1 : 0;
      if (aSig !== bSig) return bSig - aSig;
      return (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt);
    }).slice(0, 24);
  }, [accDistData.data, stockFilter]);

  const topAccumulation = filteredStocks
    .filter((s) => s.signal === "ACCUMULATION")
    .sort((a, b) => b.buyAmt - a.buyAmt)
    .slice(0, 10);
  const topDistribution = filteredStocks
    .filter((s) => s.signal === "DISTRIBUTION")
    .sort((a, b) => b.sellAmt - a.sellAmt)
    .slice(0, 10);
  const topBrokers = dateData.data?.netFlow?.slice(0, 20) || [];

  return (
    <div className="ba-page">
      {/* Header */}
      <header className="ba-header">
        <div className="ba-logo">
          <i className="fas fa-chart-line" />
          NEPSE Market Summary
        </div>
        <div className="ba-subtitle">AXION — Institutional Flow Tracker</div>
      </header>

      {/* Market Summary Panel */}
      <section className="ba-summary-panel">
        <div className="ba-summary-header">
          <div className="ba-summary-title">
            <i className="fas fa-chart-bar" /> {selectedDate || "—"}
          </div>
          <span className="ba-badge finalized">
            <i className="fas fa-check-circle" /> Floor finalized
          </span>
        </div>

        {/* Metric Row */}
        <div className="ba-metric-row">
          <div className="ba-metric-card">
            <div className="ba-metric-label">Total Turnover</div>
            <div className="ba-metric-value">{hasData ? formatCr(dateData.data!.totals.amount) : "—"}</div>
            <div className="ba-metric-sub muted">{hasData ? dateData.data!.totals.trades.toLocaleString() + " trades" : "—"}</div>
          </div>
          <div className="ba-metric-card">
            <div className="ba-metric-label">Active Brokers</div>
            <div className="ba-metric-value">{hasData ? dateData.data!.totals.brokers : "—"}</div>
            <div className="ba-metric-sub muted">participants</div>
          </div>
          <div className="ba-metric-card">
            <div className="ba-metric-label">Stocks Traded</div>
            <div className="ba-metric-value">{hasData ? dateData.data!.totals.stocks : "—"}</div>
            <div className="ba-metric-sub muted">symbols</div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="ba-quick-stats">
          <div className="ba-stat-box">
            <div className="label">Accumulated</div>
            <div className="value green">{(accDistData.data?.totals as any)?.accumulated ?? "—"}</div>
          </div>
          <div className="ba-stat-box">
            <div className="label">Distributed</div>
            <div className="value red">{(accDistData.data?.totals as any)?.distributed ?? "—"}</div>
          </div>
          <div className="ba-stat-box">
            <div className="label">Date</div>
            <div className="value gold">{selectedDate?.slice(5) || "—"}</div>
          </div>
          <div className="ba-stat-box">
            <div className="label">Status</div>
            <div className="value muted">Post-market</div>
          </div>
        </div>
      </section>

      {/* Date & Search Bar */}
      <div className="ba-date-row">
        <div className="ba-date-picker">
          <i className="fas fa-calendar" />
          {selectedDate ? (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={todayStr()}
            />
          ) : (
            <span style={{ color: "var(--ba-text-tertiary)", fontFamily: "var(--ba-font-mono)", fontSize: 14 }}>Loading...</span>
          )}
        </div>
        <span className="ba-update-notice">
          <i className="fas fa-clock" /> updates after 3PM NPT
        </span>
      </div>

      {/* Compact Search Bar */}
      <div className="ba-search-bar">
        <div className="ba-search-field">
          <i className="fas fa-user-tie" />
          <input
            type="text"
            placeholder="Broker number (e.g. 49)"
            value={brokerFilter}
            onChange={(e) => setBrokerFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && brokerFilter && setActiveBroker(brokerFilter === activeBroker ? null : brokerFilter)}
          />
        </div>
        <div className="ba-search-field">
          <i className="fas fa-chart-line" />
          <input
            type="text"
            placeholder="Stock symbol (e.g. NABIL)"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && stockFilter) setFootprintSymbol(footprintSymbol === stockFilter ? null : stockFilter); }}
          />
        </div>
        {activeBroker && (
          <span className="ba-search-badge broker">
            Broker #{activeBroker}
            <i className="fas fa-times" onClick={() => { setActiveBroker(null); setBrokerFilter(""); }} />
          </span>
        )}
        {footprintSymbol && !stockFilter && (
          <span className="ba-search-badge stock">
            {footprintSymbol}
            <i className="fas fa-times" onClick={() => setFootprintSymbol(null)} />
          </span>
        )}
      </div>

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
                    <span className="amount">+{formatCr(s.buyAmt)}</span>
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
                    <span className="amount">-{formatCr(s.sellAmt)}</span>
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
          <div className="ba-table-wrap">
            <div className="ba-section-title">
              <i className="fas fa-building" /> Broker Flow Analysis
              <span style={{ fontSize: 12, color: "var(--ba-text-secondary)", marginLeft: "auto", fontWeight: 400 }}>
                Click broker to view details
              </span>
            </div>
            <table className="ba-table">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th className="num">Buy Amount</th>
                  <th className="num">Sell Amount</th>
                  <th className="num">Net Position</th>
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
                    <td className="num">{formatCr(b.buyAmt)}</td>
                    <td className="num">{formatCr(b.sellAmt)}</td>
                    <td className={`num ${b.netAmt >= 0 ? "positive" : "negative"}`}>
                      {b.netAmt >= 0 ? "+" : ""}{formatCr(b.netAmt)}
                    </td>
                    <td className="text">
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
          </div>

          {/* Active Broker Details */}
          {activeBroker && brokerData.data && brokerData.data.stocks.length > 0 && (
            <section className="ba-broker-section">
              <div className="ba-section-title">
                <i className="fas fa-user-tie" /> Broker #{activeBroker}
                {(() => {
                  const bh = holdingData.data?.brokers?.find((b: any) => String(b.brokerId) === activeBroker);
                  return bh ? (
                    <span style={{ fontSize: 12, color: "var(--ba-text-secondary)", marginLeft: "auto", fontFamily: "var(--ba-font-mono)" }}>
                      Buy {formatCr(brokerData.data.totals.buyAmt)} · Sell {formatCr(brokerData.data.totals.sellAmt)} · Net {formatCr(brokerData.data.totals.netAmt)}
                      <span style={{ margin: "0 8px", opacity: 0.3 }}>|</span>
                      <span style={{ color: bh.netAmt >= 0 ? "var(--ba-green)" : "var(--ba-red)" }}>
                        Holding {bh.holdingPct !== null ? `${bh.holdingPct}%` : bh.note ?? "—"}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ba-text-secondary)", marginLeft: "auto", fontFamily: "var(--ba-font-mono)" }}>
                      Buy {formatCr(brokerData.data.totals.buyAmt)} · Sell {formatCr(brokerData.data.totals.sellAmt)} · Net {formatCr(brokerData.data.totals.netAmt)}
                    </span>
                  );
                })()}
              </div>
              <table className="ba-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th className="num">Buy Qty</th>
                    <th className="num">Buy Amt</th>
                    <th className="num">Sell Qty</th>
                    <th className="num">Sell Amt</th>
                    <th className="num">Net</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerData.data.stocks.map((s, i) => {
                    const si = accDistData.data?.stocks?.find((x: any) => x.symbol === s.symbol);
                    return (
                      <tr key={i}>
                        <td className="text" style={{ fontWeight: 500 }}>{s.symbol}</td>
                        <td className="num">{s.buyQty.toLocaleString()}</td>
                        <td className="num">{formatCr(s.buyAmt)}</td>
                        <td className="num">{s.sellQty.toLocaleString()}</td>
                        <td className="num">{formatCr(s.sellAmt)}</td>
                        <td className={`num ${s.netAmt >= 0 ? "positive" : "negative"}`}>
                          {s.netAmt >= 0 ? "+" : ""}{formatCr(s.netAmt)}
                        </td>
                        <td className="text">
                          {s.aggressive === "buy" ? (
                            <span style={{ color: "var(--ba-green)", fontSize: 11, fontWeight: 700 }}>AGGRESSIVE BUY</span>
                          ) : s.aggressive === "sell" ? (
                            <span style={{ color: "var(--ba-red)", fontSize: 11, fontWeight: 700 }}>AGGRESSIVE SELL</span>
                          ) : (
                            <span style={{ color: "var(--ba-blue)", fontSize: 11, fontWeight: 700 }}>MIXED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                <div
                  key={i}
                  className={`ba-stock-card ${footprintSymbol === s.symbol ? "active" : ""}`}
                  onClick={() => setFootprintSymbol(footprintSymbol === s.symbol ? null : s.symbol)}
                  style={{ cursor: "pointer" }}
                >
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
                    <div>
                      <div className="label">Top Buyer</div>
                      <div className="value" style={{ color: "var(--ba-green)", fontSize: 11 }}>{(s as any).topBuyer ? `#${(s as any).topBuyer}` : "—"}</div>
                    </div>
                    <div>
                      <div className="label">Top Seller</div>
                      <div className="value" style={{ color: "var(--ba-red)", fontSize: 11 }}>{(s as any).topSeller ? `#${(s as any).topSeller}` : "—"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Broker Buy/Sell Holding Widget */}
          <section className="ba-holding-section">
            <div className="ba-section-title">
              <i className="fas fa-scale-balanced" /> Broker Buy/Sell Holding
              <span className="ba-holding-status">
                {holdingData.loading ? (
                  <span className="badge badge-loading">Loading...</span>
                ) : holdingData.data?.status === "finalized" ? (
                  <span className="badge badge-finalized"><i className="fas fa-check-circle" /> Finalized</span>
                ) : holdingData.data?.status === "pending" ? (
                  <span className="badge badge-pending"><i className="fas fa-clock" /> Awaiting finalization (post-market)</span>
                ) : (
                  <span className="badge badge-empty"><i className="fas fa-circle" /> No Data</span>
                )}
              </span>
            </div>

            {holdingData.data?.status === "finalized" && holdingData.data.brokers.length > 0 && (
              <div className="ba-holding-grid">
                {/* Table */}
                <table className="ba-table ba-holding-table">
                  <thead>
                    <tr>
                      <th>Broker</th>
                      <th className="num">Buy Amt</th>
                      <th className="num">Sell Amt</th>
                      <th className="num">Net Amt</th>
                      <th>Holding (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingData.data.brokers.slice(0, 15).map((b) => (
                      <tr key={b.brokerId}>
                        <td className="broker-id">#{b.brokerId}</td>
                        <td className="num">{formatCr(b.buyAmt)}</td>
                        <td className="num">{formatCr(b.sellAmt)}</td>
                        <td className={`num ${b.netAmt >= 0 ? "positive" : "negative"}`}>
                          {b.netAmt >= 0 ? "+" : ""}{formatCr(b.netAmt)}
                        </td>
                        <td className="num">
                          {b.holdingPct !== null && b.note === null ? (
                            <div className="holding-bar-container">
                              <div className="holding-bar" style={{ width: `${Math.abs(b.holdingPct)}%`, background: b.netAmt >= 0 ? "var(--ba-green)" : "var(--ba-red)" }} />
                              <span className="holding-pct">{b.holdingPct}%</span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--ba-text-tertiary)", fontFamily: "var(--ba-font-mono)", fontSize: 12 }}>{b.note ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="text"><strong>TOTAL</strong></td>
                      <td className="num"><strong>{formatCr(holdingData.data.totalBuyAmt)}</strong></td>
                      <td className="num"><strong>{formatCr(holdingData.data.totalSellAmt)}</strong></td>
                      <td className={`num ${holdingData.data.totalNetAmt >= 0 ? "positive" : "negative"}`}>
                        <strong>{holdingData.data.totalNetAmt >= 0 ? "+" : ""}{formatCr(holdingData.data.totalNetAmt)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Diverging Bar Chart */}
                <div className="ba-holding-chart">
                  <div className="chart-title">Net Position by Broker</div>
                  <div className="diverging-bar-chart">
                    {(() => {
                      const d = holdingData.data!;
                      const top10 = d.brokers.slice(0, 10);
                      const maxAbs = Math.max(...top10.map((x) => Math.abs(x.netAmt)), 1);
                      return top10.map((b) => {
                        const pct = (Math.abs(b.netAmt) / maxAbs) * 100;
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
                            <div className="bar-value">{formatCr(b.netAmt)}</div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {holdingData.data?.status === "pending" && (
              <div className="ba-empty" style={{ padding: 20 }}>
                <i className="fas fa-clock" />
                <div className="empty-title">Awaiting Finalization</div>
                <div className="empty-sub">Broker buy/sell data will appear after market close once the floorsheet has stabilized</div>
              </div>
            )}

            {holdingData.data?.status === "empty" && (
              <div className="ba-empty" style={{ padding: 20 }}>
                <i className="fas fa-database" />
                <div className="empty-title">No broker data for {selectedDate}</div>
                <div className="empty-sub">No finalized floorsheet data available for this date</div>
              </div>
            )}

            {holdingData.loading && !holdingData.data && (
              <div className="ba-loading" style={{ padding: 20 }}>
                <div className="ba-spinner" />
                <div style={{ fontSize: 13 }}>Loading holding data...</div>
              </div>
            )}
          </section>

          {/* Symbol Broker Flow / Footprint — at bottom */}
          {footprintSymbol && footprintData.data && (
            <section className="ba-footprint-section">
              <div className="ba-section-title">
                <i className="fas fa-shoe-prints" /> Broker Flow — {footprintSymbol}
                <button className="ba-close-btn" onClick={() => setFootprintSymbol(null)}>
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* Best Flow Summary Cards */}
              {(() => {
                const flow = footprintData.data as any;
                if (!flow.brokers || flow.brokers.length === 0) return null;
                const brokers = flow.brokers;
                const topBuyer = brokers.reduce((a: any, b: any) => (a.buyAmt > b.buyAmt ? a : b));
                const topSeller = brokers.reduce((a: any, b: any) => (a.sellAmt > b.sellAmt ? a : b));
                const mostActive = brokers.reduce((a: any, b: any) => (a.buyAmt + a.sellAmt > b.buyAmt + b.sellAmt ? a : b));

                return (
                  <div className="ba-flow-summary">
                    <div className="ba-flow-card accumulator">
                      <div className="card-label">Top Accumulator</div>
                      <div className="card-value">#{topBuyer.brokerId}</div>
                      <div className="card-detail">Buy: {formatCr(topBuyer.buyAmt)}</div>
                    </div>
                    <div className="ba-flow-card distributor">
                      <div className="card-label">Top Distributor</div>
                      <div className="card-value">#{topSeller.brokerId}</div>
                      <div className="card-detail">Sell: {formatCr(topSeller.sellAmt)}</div>
                    </div>
                    <div className="ba-flow-card most-active">
                      <div className="card-label">Most Active</div>
                      <div className="card-value">#{mostActive.brokerId}</div>
                      <div className="card-detail">Volume: {formatCr(mostActive.buyAmt + mostActive.sellAmt)}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Broker Flow Search */}
              <div className="ba-flow-search">
                <i className="fas fa-search" />
                <input
                  type="text"
                  placeholder="Search broker by number..."
                  value={brokerFlowFilter}
                  onChange={(e) => setBrokerFlowFilter(e.target.value)}
                />
              </div>

              {/* Mini Bar Chart — Top Brokers by Net */}
              {(() => {
                const flow = footprintData.data as any;
                const allBrokers: any[] = flow.brokers ?? [];
                if (allBrokers.length === 0) return null;
                const top5 = [...allBrokers].sort((a: any, b: any) => Math.abs(b.netAmt) - Math.abs(a.netAmt)).slice(0, 5);
                const maxAbs = Math.max(...top5.map((b: any) => Math.abs(b.netAmt)), 1);
                return (
                  <div className="ba-flow-chart">
                    <div className="chart-title">Top Brokers — {footprintSymbol}</div>
                    <div className="diverging-bar-chart">
                      {top5.map((b: any) => {
                        const pct = (Math.abs(b.netAmt) / maxAbs) * 100;
                        return (
                          <div key={b.brokerId} className="diverging-bar-row" onClick={() => setActiveBroker(String(b.brokerId))} style={{ cursor: "pointer" }}>
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
                            <div className="bar-value">{formatCr(b.netAmt)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Broker Flow Table */}
              {(() => {
                const flow = footprintData.data as any;
                const allBrokers: any[] = flow.brokers ?? [];
                const filtered = brokerFlowFilter
                  ? allBrokers.filter((b: any) => String(b.brokerId).includes(brokerFlowFilter))
                  : allBrokers;
                return (
                  <table className="ba-table">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Broker</th>
                        <th className="num">Buy Qty</th>
                        <th className="num">Buy Amt</th>
                        <th className="num">Sell Qty</th>
                        <th className="num">Sell Amt</th>
                        <th className="num">Net Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((b: any, i: number) => (
                        <tr key={i} onClick={() => setActiveBroker(String(b.brokerId))}>
                          <td className="num" style={{ color: "var(--ba-text-tertiary)" }}>{i + 1}</td>
                          <td className="broker-id">#{b.brokerId}</td>
                          <td className="num">{b.buyQty?.toLocaleString() ?? "—"}</td>
                          <td className="num">{formatCr(b.buyAmt)}</td>
                          <td className="num">{b.sellQty?.toLocaleString() ?? "—"}</td>
                          <td className="num">{formatCr(b.sellAmt)}</td>
                          <td className={`num ${b.netAmt >= 0 ? "positive" : "negative"}`}>
                            {b.netAmt >= 0 ? "+" : ""}{formatCr(b.netAmt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const tb = allBrokers.reduce((a: any, b: any) => ({ buyAmt: a.buyAmt + b.buyAmt, sellAmt: a.sellAmt + b.sellAmt, netAmt: a.netAmt + b.netAmt }));
                        return (
                          <tr>
                            <td colSpan={2} className="text"><strong>TOTAL</strong></td>
                            <td className="num"><strong>—</strong></td>
                            <td className="num"><strong>{formatCr(tb.buyAmt)}</strong></td>
                            <td className="num"><strong>—</strong></td>
                            <td className="num"><strong>{formatCr(tb.sellAmt)}</strong></td>
                            <td className={`num ${tb.netAmt >= 0 ? "positive" : "negative"}`}>
                              <strong>{tb.netAmt >= 0 ? "+" : ""}{formatCr(tb.netAmt)}</strong>
                            </td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                );
              })()}
            </section>
          )}
        </>
      )}
    </div>
  );
}
