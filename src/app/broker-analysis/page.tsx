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
  const holdingData = usePoll<HoldingData>(`/api/broker-holding?date=${selectedDate}`, 30_000);

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
          BROKER ANALYSIS
        </div>
        <div className="ba-subtitle">AXION - Institutional Flow Tracker</div>
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
              <div className="value green">{(accDistData.data?.totals as any)?.accumulated ?? "—"}</div>
            </div>
            <div className="ba-stat-box">
              <div className="label">Distributed</div>
              <div className="value red">{(accDistData.data?.totals as any)?.distributed ?? "—"}</div>
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
                      <th>Buy Amt</th>
                      <th>Sell Amt</th>
                      <th>Net Amt</th>
                      <th>Holding (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingData.data.brokers.slice(0, 15).map((b) => (
                      <tr key={b.brokerId}>
                        <td className="broker-id">#{b.brokerId}</td>
                        <td>{formatCr(b.buyAmt)}</td>
                        <td>{formatCr(b.sellAmt)}</td>
                        <td className={b.netAmt >= 0 ? "positive" : "negative"}>
                          {b.netAmt >= 0 ? "+" : ""}{formatCr(b.netAmt)}
                        </td>
                        <td>
                          {b.holdingPct !== null && b.note === null ? (
                            <div className="holding-bar-container">
                              <div className="holding-bar" style={{ width: `${Math.abs(b.holdingPct)}%`, background: b.netAmt >= 0 ? "var(--ba-green, #22c55e)" : "var(--ba-red, #ef4444)" }} />
                              <span className="holding-pct">{b.holdingPct}%</span>
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 11 }}>{b.note ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>TOTAL</strong></td>
                      <td><strong>{formatCr(holdingData.data.totalBuyAmt)}</strong></td>
                      <td><strong>{formatCr(holdingData.data.totalSellAmt)}</strong></td>
                      <td className={holdingData.data.totalNetAmt >= 0 ? "positive" : "negative"}>
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
        </>
      )}
    </div>
  );
}
