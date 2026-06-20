"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus } from "@/lib/types";
import { num, compact } from "@/lib/format";
import "./broker-dashboard.css";

/* ─── Types ─── */
type BrokerAnalysis = {
  generatedAt: number;
  source?: string;
  floorCount?: number;
  totals: { trades: number; qty: number; amount: number; brokers: number; stocks: number };
  aggressiveBuy: Array<{ broker: string; stock: string; volume: number; percent: number }>;
  aggressiveSell: Array<{ broker: string; stock: string; volume: number; percent: number }>;
  brokerFavorites: Array<{ broker: string; favorites: string[] }>;
  zeroSum: Array<{ stock: string; buyer: string; seller: string; net: string }>;
  aiSignals: Array<{ type: string; stock: string; reason: string; confidence: number; level: string }>;
  liveCount: number;
};

/* ─── Market Clock ─── */
function useNepseClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const h = now.getHours(), m = now.getMinutes();
  const mins = h * 60 + m;
  const open = mins >= 600 && mins < 915;
  const timeStr = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kathmandu" });
  let countdown = "";
  if (open) {
    const closeMins = 915 - mins;
    countdown = `${Math.floor(closeMins / 60)}h ${(closeMins % 60)}m to close`;
  } else if (mins < 600) {
    const openMins = 600 - mins;
    countdown = `${Math.floor(openMins / 60)}h ${(openMins % 60)}m to open`;
  } else {
    countdown = "Market closed";
  }
  return { timeStr, open, countdown };
}

/* ─── Main Page ─── */
export default function FloorsheetDashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const clock = useNepseClock();

  // Real data from new comprehensive API
  const ba = usePoll<BrokerAnalysis>("/api/broker-analysis", open ? 15_000 : 120_000);
  // Live market data for ticker
  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);

  // UI state
  const [globalSearch, setGlobalSearch] = useState("");
  const [aggSearch, setAggSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "broker" | "stock">("overview");

  // Live stats
  const liveStats = useMemo(() => {
    const d = (live.data as { data?: LiveMarketData[] })?.data;
    if (!d?.length) return null;
    const up = d.filter((r) => r.percentageChange > 0).length;
    const down = d.filter((r) => r.percentageChange < 0).length;
    const totalVol = d.reduce((s, r) => s + r.totalTradeQuantity, 0);
    const totalAmt = d.reduce((s, r) => s + r.totalTradeValue, 0);
    return { stocks: d.length, up, down, totalVol, totalAmt };
  }, [live.data]);

  // Ticker from live data
  const tickerItems = useMemo(() => {
    const d = (live.data as { data?: LiveMarketData[] })?.data;
    if (!d?.length) return [];
    return d.slice(0, 20).map((r) => ({
      symbol: r.symbol, price: r.lastTradedPrice,
      change: r.percentageChange, vol: num(r.totalTradeQuantity),
    }));
  }, [live.data]);

  // Real aggressive data from broker analysis
  const aggressiveBuy = ba.data?.aggressiveBuy || [];
  const aggressiveSell = ba.data?.aggressiveSell || [];
  const brokerFavorites = ba.data?.brokerFavorites || [];
  const zeroSum = ba.data?.zeroSum || [];
  const aiSignals = ba.data?.aiSignals || [];
  const totals = ba.data?.totals;

  // Global search filter
  const q = globalSearch.trim().toLowerCase();

  const filteredAggBuy = useMemo(() => {
    let items = aggressiveBuy;
    if (aggSearch) {
      const aq = aggSearch.toLowerCase();
      items = items.filter((i) => i.stock.toLowerCase().includes(aq) || i.broker.includes(aq));
    }
    if (q) {
      items = items.filter((i) => i.stock.toLowerCase().includes(q) || i.broker.includes(q));
    }
    return items;
  }, [aggSearch, q, aggressiveBuy]);

  const filteredAggSell = useMemo(() => {
    let items = aggressiveSell;
    if (aggSearch) {
      const aq = aggSearch.toLowerCase();
      items = items.filter((i) => i.stock.toLowerCase().includes(aq) || i.broker.includes(aq));
    }
    if (q) {
      items = items.filter((i) => i.stock.toLowerCase().includes(q) || i.broker.includes(q));
    }
    return items;
  }, [aggSearch, q, aggressiveSell]);

  const filteredFavorites = useMemo(() => {
    if (!q) return brokerFavorites;
    return brokerFavorites.filter((b) =>
      b.broker.includes(q) || b.favorites.some((s) => s.toLowerCase().includes(q))
    );
  }, [q, brokerFavorites]);

  const filteredZeroSum = useMemo(() => {
    if (!q) return zeroSum;
    return zeroSum.filter((z) => z.stock.toLowerCase().includes(q) || z.buyer.includes(q) || z.seller.includes(q));
  }, [q, zeroSum]);

  const filteredAiSignals = useMemo(() => {
    if (!q) return aiSignals;
    return aiSignals.filter((s) => s.stock.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.reason.toLowerCase().includes(q));
  }, [q, aiSignals]);

  // Match count for display
  const matchCount = useMemo(() => {
    if (!q) return -1;
    return filteredAggBuy.length + filteredAggSell.length + filteredFavorites.length + filteredZeroSum.length + filteredAiSignals.length;
  }, [q, filteredAggBuy, filteredAggSell, filteredFavorites, filteredZeroSum, filteredAiSignals]);

  // Market depth from live data (top gainers = buy pressure, top losers = sell pressure)
  const depthData = useMemo(() => {
    const d = (live.data as { data?: LiveMarketData[] })?.data;
    if (!d?.length) return { bids: [], asks: [] };
    const sorted = [...d].sort((a, b) => b.totalTradeValue - a.totalTradeValue);
    const bids = sorted.filter((r) => r.percentageChange > 0).slice(0, 5);
    const asks = sorted.filter((r) => r.percentageChange < 0).slice(0, 5);
    return { bids, asks };
  }, [live.data]);

  return (
    <div className="ba-dashboard">
      {/* ── HEADER ── */}
      <div className="ba-header">
        <div className="ba-logo">
          <i className="fas fa-brain" /> Broker Analysis
        </div>
      </div>

      {/* ── SEARCH + TABS ROW ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="ba-search" style={{ flex: 1, minWidth: 200 }}>
          <i className="fas fa-search" />
          <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search broker, stock, symbol..." />
        </div>
        {matchCount >= 0 && (
          <span className="ba-search-count" style={{ whiteSpace: "nowrap" }}>
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </span>
        )}
        <div className="ba-tabs" style={{ margin: 0, border: "none", padding: 0 }}>
          {(["overview", "broker", "stock"] as const).map((tab) => (
            <button key={tab} className={`ba-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              <i className={`fas ${tab === "overview" ? "fa-th-large" : tab === "broker" ? "fa-building" : "fa-chart-line"}`} />
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="ba-stats" style={{ marginBottom: 12 }}>
        <div className="ba-stat">
          <div className="ba-stat-label"><i className="fas fa-exchange-alt" /> Floorsheet Trades</div>
          <div className="ba-stat-value gold">{totals ? num(totals.trades) : ba.loading ? "..." : "-"}</div>
          <div className="ba-stat-sub">{totals ? `${totals.brokers} brokers, ${totals.stocks} stocks` : "Loading..."}</div>
        </div>
        <div className="ba-stat">
          <div className="ba-stat-label"><i className="fas fa-coins" /> Total Amount</div>
          <div className="ba-stat-value gold">Rs {totals ? compact(totals.amount) : "-"}</div>
          <div className="ba-stat-sub">{totals ? `${num(totals.qty)} shares traded` : "from floorsheet"}</div>
        </div>
        <div className="ba-stat">
          <div className="ba-stat-label"><i className="fas fa-arrow-up" /> Advances</div>
          <div className="ba-stat-value green">{num(liveStats?.up ?? 0)}</div>
          <div className="ba-stat-sub">{liveStats ? `${((liveStats.up / liveStats.stocks) * 100).toFixed(0)}% of ${liveStats.stocks}` : "from live market"}</div>
        </div>
        <div className="ba-stat">
          <div className="ba-stat-label"><i className="fas fa-arrow-down" /> Declines</div>
          <div className="ba-stat-value red">{num(liveStats?.down ?? 0)}</div>
          <div className="ba-stat-sub">{liveStats ? `${((liveStats.down / liveStats.stocks) * 100).toFixed(0)}% of ${liveStats.stocks}` : "from live market"}</div>
        </div>
        <div className="ba-stat">
          <div className="ba-stat-label"><i className="fas fa-chart-line" /> Turnover</div>
          <div className="ba-stat-value blue">Rs {compact(liveStats?.totalAmt ?? 0)}</div>
          <div className="ba-stat-sub">{liveStats ? `${num(liveStats.totalVol)} total volume` : "live market"}</div>
        </div>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <>
          {/* AI Signals */}
          {filteredAiSignals.length > 0 && (
            <>
              <div className="ba-section-title">
                <i className="fas fa-robot" /> AI Smart Signals {q && <span className="ba-match-badge">{filteredAiSignals.length}</span>} <span className="ba-section-line" />
              </div>
              <section className="ba-signal-grid">
                {filteredAiSignals.map((s, i) => {
                  const icon = s.type === "BUY" ? "fa-arrow-trend-up" : s.type === "SELL" ? "fa-arrow-trend-down" : s.type === "HOLD" ? "fa-minus" : "fa-chart-line";
                  const color = s.type === "BUY" ? "var(--ba-green)" : s.type === "SELL" ? "var(--ba-red)" : s.type === "HOLD" ? "var(--ba-gold)" : "var(--ba-blue)";
                  return (
                    <div key={i} className="ba-signal-card">
                      <div className={`ba-signal-icon ${s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : s.type === "HOLD" ? "hold" : "neutral"}`}>
                        <i className={`fas ${icon}`} />
                      </div>
                      <div>
                        <div className="ba-signal-main" style={{ color }}>{s.type}</div>
                        <div className="ba-signal-sub">{s.stock} - {s.reason}</div>
                      </div>
                      <span className={`ba-signal-conf ${s.level}`}>{s.confidence}%</span>
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {/* Order Flow */}
          <div className="ba-section-title">
            <i className="fas fa-exchange-alt" /> Market Depth <span className="ba-section-line" />
          </div>
          <section className="ba-order-grid">
            <div className="ba-order-card">
              <div className="ba-card-head">
                <h4><i className="fas fa-layer-group" style={{ color: "var(--ba-gold)" }} /> Buy Pressure (Top Stocks)</h4>
                <span className="ba-pill ba-pill-buy">Bid</span>
              </div>
              {depthData.bids.length > 0 ? depthData.bids.map((r, i) => {
                const maxVol = Math.max(...depthData.bids.map((x) => x.totalTradeQuantity));
                return (
                  <div key={i} className="ba-depth-row">
                    <span className="ba-depth-price" style={{ color: "var(--ba-green)" }}>{r.symbol}</span>
                    <span className="ba-depth-vol">{num(r.totalTradeQuantity)}</span>
                    <div className="ba-depth-bar-wrap"><div className="ba-depth-fill bid" style={{ width: `${(r.totalTradeQuantity / maxVol) * 100}%` }} /></div>
                  </div>
                );
              }) : <div className="ba-no-results">Waiting for live data...</div>}
            </div>
            <div className="ba-order-card">
              <div className="ba-card-head">
                <h4><i className="fas fa-layer-group" style={{ color: "var(--ba-red)" }} /> Sell Pressure (Top Stocks)</h4>
                <span className="ba-pill ba-pill-sell">Ask</span>
              </div>
              {depthData.asks.length > 0 ? depthData.asks.map((r, i) => {
                const maxVol = Math.max(...depthData.asks.map((x) => x.totalTradeQuantity));
                return (
                  <div key={i} className="ba-depth-row">
                    <span className="ba-depth-price" style={{ color: "var(--ba-red)" }}>{r.symbol}</span>
                    <span className="ba-depth-vol">{num(r.totalTradeQuantity)}</span>
                    <div className="ba-depth-bar-wrap"><div className="ba-depth-fill ask" style={{ width: `${(r.totalTradeQuantity / maxVol) * 100}%` }} /></div>
                  </div>
                );
              }) : <div className="ba-no-results">Waiting for live data...</div>}
            </div>
          </section>

          {/* Aggressive Buy / Sell */}
          <div className="ba-section-title">
            <i className="fas fa-fire" /> Aggressive Buy / Sell
            <div className="ba-mini-search">
              <i className="fas fa-search" />
              <input value={aggSearch} onChange={(e) => setAggSearch(e.target.value)} placeholder="Filter..." />
            </div>
            <span className="ba-section-line" />
          </div>
          <section className="ba-agg-grid">
            <div className="ba-agg-card">
              <div className="ba-card-head">
                <h4><i className="fas fa-arrow-up" style={{ color: "var(--ba-green)" }} /> Aggressive Buy</h4>
                <span className="ba-agg-pill ba-agg-pill-buy">High Momentum</span>
              </div>
              {filteredAggBuy.length > 0 ? filteredAggBuy.map((item, i) => (
                <div key={i} className="ba-agg-item">
                  <div className="ba-agg-item-head">
                    <span><span className="ba-broker">Broker {item.broker}</span><span className="ba-stock-arrow"> {"->"} {item.stock}</span></span>
                    <span className="ba-volume bull">+{item.volume.toFixed(2)} Cr</span>
                  </div>
                  <div className="ba-impact-bar"><div className="ba-impact-fill bull" style={{ width: `${item.percent}%` }} /></div>
                </div>
              )) : <div className="ba-no-results">{aggSearch ? "No matches" : ba.loading ? "Loading floorsheet..." : "No aggressive buy detected"}</div>}
            </div>
            <div className="ba-agg-card">
              <div className="ba-card-head">
                <h4><i className="fas fa-arrow-down" style={{ color: "var(--ba-red)" }} /> Aggressive Sell</h4>
                <span className="ba-agg-pill ba-agg-pill-sell">High Selling</span>
              </div>
              {filteredAggSell.length > 0 ? filteredAggSell.map((item, i) => (
                <div key={i} className="ba-agg-item">
                  <div className="ba-agg-item-head">
                    <span><span className="ba-broker">Broker {item.broker}</span><span className="ba-stock-arrow"> {"->"} {item.stock}</span></span>
                    <span className="ba-volume bear">-{item.volume.toFixed(2)} Cr</span>
                  </div>
                  <div className="ba-impact-bar"><div className="ba-impact-fill bear" style={{ width: `${item.percent}%` }} /></div>
                </div>
              )) : <div className="ba-no-results">{aggSearch ? "No matches" : ba.loading ? "Loading floorsheet..." : "No aggressive sell detected"}</div>}
            </div>
          </section>
        </>
      )}

      {/* ── BROKER TAB ── */}
      {activeTab === "broker" && (
        <>
          {/* Broker Favorites */}
          <div className="ba-section-title">
            <i className="fas fa-star" /> Broker Favorites (Most Traded Stocks) {q && <span className="ba-match-badge">{filteredFavorites.length}</span>} <span className="ba-section-line" />
          </div>
          <section className="ba-fav-grid">
            {filteredFavorites.length > 0 ? filteredFavorites.map((b) => (
              <div key={b.broker} className="ba-fav-card">
                <div className="ba-fav-broker"><i className="fas fa-building" style={{ color: "var(--ba-gold)", marginRight: 8 }} />Broker #{b.broker}</div>
                <div className="ba-fav-tags">
                  {b.favorites.map((s) => (
                    <Link key={s} href={`/stock/${s}`} className="ba-fav-tag">{s}</Link>
                  ))}
                </div>
              </div>
            )) : <div className="ba-no-results">{ba.loading ? "Loading floorsheet..." : "No broker data available"}</div>}
          </section>

          {/* Broker Holding Chart */}
          <div className="ba-section-title">
            <i className="fas fa-warehouse" /> Broker Net Holding (Kitta) <span className="ba-section-line" />
          </div>
          <section className="ba-holding-card">
            <div className="ba-holding-count">{brokerFavorites.length} active brokers</div>
            <BrokerHoldingChart favorites={brokerFavorites} />
          </section>

          {/* Zero-Sum */}
          {filteredZeroSum.length > 0 && (
            <>
              <div className="ba-section-title">
                <i className="fas fa-balance-scale-right" /> Zero-Sum Positions {q && <span className="ba-match-badge">{filteredZeroSum.length}</span>} <span className="ba-section-line" />
              </div>
              <section className="ba-zero-list">
                {filteredZeroSum.map((item, i) => (
                  <div key={i} className="ba-zero-item">
                    <span className="ba-zero-stock">{item.stock}</span>
                    <span className="ba-zero-detail">
                      <i className="fas fa-arrow-up" style={{ color: "var(--ba-green)", marginRight: 4 }} /> Buyer: #{item.buyer}
                    </span>
                    <span className="ba-zero-detail">
                      <i className="fas fa-arrow-down" style={{ color: "var(--ba-red)", marginRight: 4 }} /> Seller: #{item.seller}
                    </span>
                    <span className="ba-zero-net" style={{ color: item.net.startsWith("+") ? "var(--ba-green)" : "var(--ba-red)" }}>
                      {item.net}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <>
          {/* Most Active Stocks from floorsheet */}
          <div className="ba-section-title">
            <i className="fas fa-fire-alt" /> Most Active Stocks (from Floorsheet) <span className="ba-section-line" />
          </div>
          <section className="ba-order-card" style={{ marginBottom: 22 }}>
            {aggressiveBuy.length > 0 || aggressiveSell.length > 0 ? (
              <table className="ba-stock-table">
                <thead>
                  <tr><th>#</th><th>Stock</th><th>Agg. Buy Broker</th><th>Volume (Cr)</th><th>Agg. Sell Broker</th><th>Volume (Cr)</th></tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(aggressiveBuy.length, aggressiveSell.length) }).map((_, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><Link href={`/stock/${aggressiveBuy[i]?.stock || aggressiveSell[i]?.stock || ""}`} className="ba-stock-link">{aggressiveBuy[i]?.stock || aggressiveSell[i]?.stock || "-"}</Link></td>
                      <td style={{ color: "var(--ba-green)" }}>#{aggressiveBuy[i]?.broker || "-"}</td>
                      <td style={{ color: "var(--ba-green)" }}>{aggressiveBuy[i] ? `+${aggressiveBuy[i].volume.toFixed(2)}` : "-"}</td>
                      <td style={{ color: "var(--ba-red)" }}>#{aggressiveSell[i]?.broker || "-"}</td>
                      <td style={{ color: "var(--ba-red)" }}>{aggressiveSell[i] ? `${aggressiveSell[i].volume.toFixed(2)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="ba-no-results">{ba.loading ? "Loading floorsheet data..." : "No floorsheet data available"}</div>}
          </section>

          {/* Zero-Sum Stocks */}
          {filteredZeroSum.length > 0 && (
            <>
              <div className="ba-section-title">
                <i className="fas fa-balance-scale" /> Contested Stocks (Buy vs Sell) {q && <span className="ba-match-badge">{filteredZeroSum.length}</span>} <span className="ba-section-line" />
              </div>
              <section className="ba-order-card" style={{ marginBottom: 22 }}>
                {filteredZeroSum.map((item, i) => (
                  <div key={i} className="ba-week-item">
                    <div className="ba-week-head">
                      <span className="ba-week-stock"><Link href={`/stock/${item.stock}`}>{item.stock}</Link></span>
                      <span className="ba-week-vol">Buyer: #{item.buyer} vs Seller: #{item.seller}</span>
                    </div>
                    <div className="ba-week-bar-wrap">
                      <div className="ba-week-marker" style={{
                        left: "50%",
                        background: item.net.startsWith("+") ? "var(--ba-green)" : "var(--ba-red)",
                      }} />
                    </div>
                    <div className="ba-week-labels">
                      <span style={{ color: "var(--ba-red)" }}>Sell: #{item.seller}</span>
                      <span style={{ color: item.net.startsWith("+") ? "var(--ba-green)" : "var(--ba-red)", fontWeight: 700 }}>Net: {item.net}</span>
                      <span style={{ color: "var(--ba-green)" }}>Buy: #{item.buyer}</span>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Broker Holding Chart ─── */
function BrokerHoldingChart({ favorites }: { favorites: Array<{ broker: string; favorites: string[] }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { Chart, registerables } = await import("chart.js");
      if (cancelled) return;
      Chart.register(...registerables);
      if (!canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();

      const top = favorites.slice(0, 8);
      const colors = ["#3bdd9a", "#4b8cfa", "#f56b7a", "#f5b842", "#a78bfa", "#f59e0b", "#06b6d4", "#ec4899"];

      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: top.map((b) => `#${b.broker}`),
          datasets: [{
            label: "Top Stocks Count",
            data: top.map((b) => b.favorites.length),
            backgroundColor: top.map((_, i) => colors[i % colors.length]),
            borderRadius: 8,
            barThickness: 24,
          }],
        },
        options: {
          indexAxis: "y" as const,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const broker = top[ctx.dataIndex];
                  return `Favorites: ${broker.favorites.join(", ")}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: "rgba(26,45,74,0.3)" },
              ticks: { color: "#8aa4d0" },
            },
            y: {
              grid: { display: false },
              ticks: { color: "#ecf3fa", font: { weight: "bold" as const } },
            },
          },
        },
      });
    }
    init();
    return () => { cancelled = true; if (chartRef.current) chartRef.current.destroy(); };
  }, [favorites]);

  return <div style={{ height: Math.max(200, favorites.length * 40) }}><canvas ref={canvasRef} /></div>;
}
