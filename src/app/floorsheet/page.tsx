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
  error?: string;
  floorCount?: number;
  totals: { trades: number; qty: number; amount: number; brokers: number; stocks: number };
  aggressiveBuy: Array<{ broker: string; stock: string; volume: number; percent: number }>;
  aggressiveSell: Array<{ broker: string; stock: string; volume: number; percent: number }>;
  brokerFavorites: Array<{ broker: string; favorites: string[] }>;
  brokerNetHoldings: Array<{
    broker: string; buyQty: number; sellQty: number; netQty: number;
    buyAmt: number; sellAmt: number; netAmt: number;
    stockCount: number; totalVolume: number;
    topStocks: Array<{ symbol: string; netQty: number; netAmt: number }>;
  }>;
  zeroSum: Array<{
    stock: string; buyer: string; seller: string;
    netValue: number; netVolume: number;
    buyValue: number; sellValue: number;
    buyVolume: number; sellVolume: number;
    buyerPercent: number; sellerPercent: number;
    totalTradedValue: number;
    status: string; statusEmoji: string; confidence: number;
    brokerBattle: string; winner: string;
    isInternalRotation: boolean; isContested: boolean;
    netPercent: number;
    topBrokers: Array<{ broker: string; buyQty: number; sellQty: number; netQty: number; buyAmt: number; sellAmt: number; netAmt: number }>;
  }>;
  aiSignals: Array<{ type: string; stock: string; reason: string; confidence: number; level: string }>;
  liveCount: number;
  liveData?: { advances: number; declines: number; unchanged: number } | null;
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
  const [stockSearch, setStockSearch] = useState("");
  const [zeroSumSearch, setZeroSumSearch] = useState("");
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
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

  // All NEPSE stock symbols for search
  const allStockSymbols = useMemo(() => {
    const d = (live.data as { data?: LiveMarketData[] })?.data;
    if (!d?.length) return [];
    return d.map((r) => r.symbol).sort();
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
  const apiError = ba.data?.error;

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
    let items = zeroSum;
    // Zero-sum specific search filter (higher priority)
    if (zeroSumSearch.trim()) {
      const sq = zeroSumSearch.trim().toLowerCase();
      // Find exact match first, then partial matches
      const exactMatch = items.filter((z) => z.stock.toLowerCase() === sq);
      if (exactMatch.length > 0) {
        return exactMatch; // Return exact match immediately
      }
      // Otherwise return partial matches
      items = items.filter((z) => z.stock.toLowerCase().includes(sq));
    } else if (q) {
      // Global search filter (only if no specific search)
      items = items.filter((z) => z.stock.toLowerCase().includes(q) || z.buyer.includes(q) || z.seller.includes(q));
    }
    // Limit to top 10 stocks
    return items.slice(0, 10);
  }, [q, zeroSumSearch, zeroSum]);

  const filteredAiSignals = useMemo(() => {
    if (!q) return aiSignals;
    return aiSignals.filter((s) => s.stock.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.reason.toLowerCase().includes(q));
  }, [q, aiSignals]);

  // Match count for display
  const matchCount = useMemo(() => {
    if (!q) return -1;
    return filteredAggBuy.length + filteredAggSell.length + filteredFavorites.length + filteredZeroSum.length + filteredAiSignals.length;
  }, [q, filteredAggBuy, filteredAggSell, filteredFavorites, filteredZeroSum, filteredAiSignals]);

  // Market depth — buy/sell pressure from MeroLagani broker-level net flow
  // (real NEPSE order book depth is blocked from Vercel, so we use broker
  //  net-position data to identify stocks with strongest buying/selling interest)
  const depthData = useMemo(() => {
    const d = (live.data as { data?: LiveMarketData[] })?.data;
    if (!d?.length) return { bids: [], asks: [] };
    // Sort stocks by total trade value (highest first), then assign side based on
    // price-weighted volume. Stocks where totalTradeValue / totalTradeQuantity is
    // closer to ask side (higher price = buying pressure) vs bid side (lower = selling).
    // Simple heuristic: if lastTradedPrice > openPrice = buy pressure, else sell.
    const sorted = [...d].sort((a, b) => b.totalTradeValue - a.totalTradeValue);
    const hasOpen = sorted.some((r) => r.openPrice > 0);
    const bids = sorted
      .filter((r) => hasOpen ? (r.lastTradedPrice >= r.openPrice) : (r.percentageChange > 0))
      .slice(0, 5);
    const asks = sorted
      .filter((r) => hasOpen ? (r.lastTradedPrice < r.openPrice) : (r.percentageChange < 0))
      .slice(0, 5);
    return { bids, asks };
  }, [live.data]);

  return (
    <div className="ba-dashboard">
      {/* ── COMPACT HEADER ── */}
      <div className="ba-header-compact">
        <div className="ba-header-row">
          {/* Logo + Title */}
          <div className="ba-logo">
            <i className="fas fa-brain" />
            <span>Broker Analysis</span>
          </div>

          {/* Search Bar */}
          <div className="ba-search-compact">
            <i className="fas fa-search" />
            <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search broker, stock, symbol..." />
            {matchCount >= 0 && (
              <span className="ba-search-count">{matchCount}</span>
            )}
          </div>

          {/* Tabs */}
          <div className="ba-tabs-compact">
            {(["overview", "broker", "stock"] as const).map((tab) => (
              <button key={tab} className={`ba-tab-compact ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                <i className={`fas ${tab === "overview" ? "fa-th-large" : tab === "broker" ? "fa-building" : "fa-chart-line"}`} />
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="ba-stats-grid-compact">
          <div className="ba-stat-card-compact ba-stat-green">
            <div className="ba-stat-icon"><i className="fas fa-arrow-up" /></div>
            <div className="ba-stat-content">
              <div className="ba-stat-label">Advances</div>
              <div className="ba-stat-value">{num(liveStats?.up ?? ba.data?.liveData?.advances ?? 0)}</div>
              <div className="ba-stat-sub">{liveStats ? `${((liveStats.up / liveStats.stocks) * 100).toFixed(0)}% of ${liveStats.stocks}` : "from live market"}</div>
            </div>
          </div>
          <div className="ba-stat-card-compact ba-stat-red">
            <div className="ba-stat-icon"><i className="fas fa-arrow-down" /></div>
            <div className="ba-stat-content">
              <div className="ba-stat-label">Declines</div>
              <div className="ba-stat-value">{num(liveStats?.down ?? ba.data?.liveData?.declines ?? 0)}</div>
              <div className="ba-stat-sub">{liveStats ? `${((liveStats.down / liveStats.stocks) * 100).toFixed(0)}% of ${liveStats.stocks}` : "from live market"}</div>
            </div>
          </div>
          <div className="ba-stat-card-compact ba-stat-blue">
            <div className="ba-stat-icon"><i className="fas fa-chart-line" /></div>
            <div className="ba-stat-content">
              <div className="ba-stat-label">Turnover</div>
              <div className="ba-stat-value">Rs {compact(liveStats?.totalAmt ?? totals?.amount ?? 0)}</div>
              <div className="ba-stat-sub">{liveStats ? `${num(liveStats.totalVol)} total volume` : "live market"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── INFO/ERROR BANNER ── */}
      {apiError && !ba.loading && (
        <div style={{
          background: ba.data?.source?.includes("sample") ? "rgba(75, 140, 250, 0.1)" : (ba.data?.liveCount ?? 0) > 0 ? "rgba(245, 184, 66, 0.1)" : "rgba(245, 101, 101, 0.1)",
          border: `1px solid ${ba.data?.source?.includes("sample") ? "rgba(75, 140, 250, 0.3)" : (ba.data?.liveCount ?? 0) > 0 ? "rgba(245, 184, 66, 0.3)" : "rgba(245, 101, 101, 0.3)"}`,
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <i className={`fas ${ba.data?.source?.includes("sample") ? "fa-flask" : (ba.data?.liveCount ?? 0) > 0 ? "fa-info-circle" : "fa-exclamation-triangle"}`}
             style={{ color: ba.data?.source?.includes("sample") ? "var(--ba-blue)" : (ba.data?.liveCount ?? 0) > 0 ? "var(--ba-gold)" : "var(--ba-red)", fontSize: 18 }} />
          <span style={{ flex: 1, color: ba.data?.source?.includes("sample") ? "var(--ba-blue)" : (ba.data?.liveCount ?? 0) > 0 ? "var(--ba-gold)" : "var(--ba-red)", fontSize: 13, fontWeight: 500 }}>
            {apiError}
          </span>
          <button
            onClick={() => { ba.refresh?.(); }}
            style={{
              background: ba.data?.source?.includes("sample") ? "var(--ba-blue)" : (ba.data?.liveCount ?? 0) > 0 ? "var(--ba-gold)" : "var(--ba-red)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <i className="fas fa-sync-alt" style={{ marginRight: 6 }} /> Retry
          </button>
        </div>
      )}

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

          {/* Order Flow — Top Stocks by Volume */}
          <div className="ba-section-title">
            <i className="fas fa-exchange-alt" /> Most Active Stocks
            <span className="ba-section-line" />
          </div>
          <div style={{ fontSize: 11, color: "var(--ba-text-muted)", marginBottom: 8, padding: "0 4px" }}>
            <i className="fas fa-info-circle" /> Live volume data (MeroLagani source). Real NEPSE order book depth unavailable.
          </div>
          <section className="ba-order-grid">
            <div className="ba-order-card">
              <div className="ba-card-head">
                <h4><i className="fas fa-arrow-trend-up" style={{ color: "var(--ba-green)" }} /> Up — High Volume</h4>
                <span className="ba-pill ba-pill-buy">Momentum</span>
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
                <h4><i className="fas fa-arrow-trend-down" style={{ color: "var(--ba-red)" }} /> Down — High Volume</h4>
                <span className="ba-pill ba-pill-sell">Weakness</span>
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

          {/* Deep Broker Analysis */}
          {ba.data?.brokerNetHoldings && ba.data.brokerNetHoldings.length > 0 && (
            <>
              <div className="ba-section-title">
                <i className="fas fa-microscope" /> Deep Broker Analysis
                <span className="ba-section-line" />
              </div>
              <section className="ba-deep-broker-grid">
                {/* Broker Activity Leaders - FIRST */}
                <div className="ba-deep-card">
                  <div className="ba-deep-card-header">
                    <i className="fas fa-chart-bar" style={{ color: "var(--ba-blue)" }} />
                    <span>Broker Activity Leaders</span>
                  </div>
                  <div className="ba-deep-broker-list">
                    {ba.data.brokerNetHoldings
                      .sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty))
                      .slice(0, 5)
                      .map((b, idx) => {
                        const totalTrades = b.buyQty + b.sellQty;
                        const maxVol = ba.data!.brokerNetHoldings[0]?.totalVolume || 1;
                        const activityPercent = (totalTrades / maxVol) * 100;
                        return (
                          <div key={b.broker} className="ba-deep-broker-row" onClick={() => setSelectedBroker(b.broker)} style={{ cursor: "pointer" }}>
                            <div className="ba-deep-rank">#{idx + 1}</div>
                            <div className="ba-deep-broker-info">
                              <div className="ba-deep-broker-name">Broker #{b.broker}</div>
                              <div className="ba-deep-activity-bar">
                                <div className="ba-deep-activity-fill" style={{ width: `${activityPercent}%` }} />
                              </div>
                            </div>
                            <div className="ba-deep-broker-net">
                              {num(totalTrades)} qty
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Top 5 Most Active Brokers */}
                <div className="ba-deep-card">
                  <div className="ba-deep-card-header">
                    <i className="fas fa-fire" style={{ color: "var(--ba-gold)" }} />
                    <span>Top 5 Most Active Brokers</span>
                  </div>
                  <div className="ba-deep-broker-list">
                    {ba.data.brokerNetHoldings.slice(0, 5).map((b, idx) => {
                      const isBuyer = b.netQty > 0;
                      return (
                        <div key={b.broker} className="ba-deep-broker-row" onClick={() => setSelectedBroker(b.broker)} style={{ cursor: "pointer" }}>
                          <div className="ba-deep-rank">#{idx + 1}</div>
                          <div className="ba-deep-broker-info">
                            <div className="ba-deep-broker-name">Broker #{b.broker}</div>
                            <div className="ba-deep-broker-meta">{b.stockCount} stocks · {num(b.totalVolume)} qty</div>
                          </div>
                          <div className={`ba-deep-broker-net ${isBuyer ? "buy" : "sell"}`}>
                            {isBuyer ? "▲" : "▼"} {Math.abs(b.netAmt).toFixed(2)} Cr
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Biggest Net Buyers */}
                <div className="ba-deep-card">
                  <div className="ba-deep-card-header">
                    <i className="fas fa-arrow-up" style={{ color: "var(--ba-green)" }} />
                    <span>Biggest Net Buyers</span>
                  </div>
                  <div className="ba-deep-broker-list">
                    {ba.data.brokerNetHoldings
                      .filter(b => b.netAmt > 0)
                      .sort((a, b) => b.netAmt - a.netAmt)
                      .slice(0, 5)
                      .map((b, idx) => (
                        <div key={b.broker} className="ba-deep-broker-row" onClick={() => setSelectedBroker(b.broker)} style={{ cursor: "pointer" }}>
                          <div className="ba-deep-rank">#{idx + 1}</div>
                          <div className="ba-deep-broker-info">
                            <div className="ba-deep-broker-name">Broker #{b.broker}</div>
                            <div className="ba-deep-broker-meta">Buy: {b.buyAmt.toFixed(2)} Cr · Sell: {b.sellAmt.toFixed(2)} Cr</div>
                          </div>
                          <div className="ba-deep-broker-net buy">
                            +{b.netAmt.toFixed(2)} Cr
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Biggest Net Sellers */}
                <div className="ba-deep-card">
                  <div className="ba-deep-card-header">
                    <i className="fas fa-arrow-down" style={{ color: "var(--ba-red)" }} />
                    <span>Biggest Net Sellers</span>
                  </div>
                  <div className="ba-deep-broker-list">
                    {ba.data.brokerNetHoldings
                      .filter(b => b.netAmt < 0)
                      .sort((a, b) => a.netAmt - b.netAmt)
                      .slice(0, 5)
                      .map((b, idx) => (
                        <div key={b.broker} className="ba-deep-broker-row" onClick={() => setSelectedBroker(b.broker)} style={{ cursor: "pointer" }}>
                          <div className="ba-deep-rank">#{idx + 1}</div>
                          <div className="ba-deep-broker-info">
                            <div className="ba-deep-broker-name">Broker #{b.broker}</div>
                            <div className="ba-deep-broker-meta">Buy: {b.buyAmt.toFixed(2)} Cr · Sell: {b.sellAmt.toFixed(2)} Cr</div>
                          </div>
                          <div className="ba-deep-broker-net sell">
                            {b.netAmt.toFixed(2)} Cr
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* All Brokers Net Holdings Map */}
          {ba.data?.brokerNetHoldings && ba.data.brokerNetHoldings.length > 0 && (
            <>
              <div className="ba-section-title-compact">
                <i className="fas fa-th" /> All Brokers Net Holdings Map ({ba.data.brokerNetHoldings.length} Brokers)
              </div>
              <section className="ba-map-container">
                {/* Stats Summary - Compact */}
                <div className="ba-stats-grid-mini">
                  <div className="ba-stat-card-mini">
                    <div className="ba-stat-label-mini">Net Buyers</div>
                    <div className="ba-stat-value-mini buy">
                      {ba.data.brokerNetHoldings.filter(b => b.netQty > 0).length}
                    </div>
                  </div>
                  <div className="ba-stat-card-mini">
                    <div className="ba-stat-label-mini">Net Sellers</div>
                    <div className="ba-stat-value-mini sell">
                      {ba.data.brokerNetHoldings.filter(b => b.netQty < 0).length}
                    </div>
                  </div>
                  <div className="ba-stat-card-mini">
                    <div className="ba-stat-label-mini">Total Volume</div>
                    <div className="ba-stat-value-mini gold">
                      {num(ba.data.brokerNetHoldings.reduce((sum, b) => sum + b.totalVolume, 0))}
                    </div>
                  </div>
                  <div className="ba-stat-card-mini">
                    <div className="ba-stat-label-mini">Net Flow</div>
                    <div className={`ba-stat-value-mini ${ba.data.brokerNetHoldings.reduce((sum, b) => sum + b.netAmt, 0) >= 0 ? "buy" : "sell"}`}>
                      {ba.data.brokerNetHoldings.reduce((sum, b) => sum + b.netAmt, 0) >= 0 ? "+" : ""}{ba.data.brokerNetHoldings.reduce((sum, b) => sum + b.netAmt, 0).toFixed(2)} Cr
                    </div>
                  </div>
                </div>

                {/* Broker Grid Map - Compact */}
                <div className="ba-broker-map-grid-compact">
                  {ba.data.brokerNetHoldings.map((b) => {
                    const isBuyer = b.netQty > 0;
                    const intensity = Math.min(Math.abs(b.netAmt) / 5, 1);
                    const bgColor = isBuyer 
                      ? `rgba(59, 221, 154, ${0.1 + intensity * 0.4})` 
                      : `rgba(245, 107, 122, ${0.1 + intensity * 0.4})`;
                    const borderColor = isBuyer ? "var(--ba-green)" : "var(--ba-red)";
                    
                    return (
                      <div key={b.broker} className="ba-broker-map-card-compact" style={{
                        background: bgColor,
                        borderColor: borderColor,
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedBroker(b.broker)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform = "scale(1.05)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
                      }}>
                        <div className="ba-broker-id-compact">#{b.broker}</div>
                        <div className="ba-broker-net-compact" style={{ color: borderColor }}>
                          {isBuyer ? "+" : ""}{b.netAmt} Cr
                        </div>
                        <div className="ba-broker-meta-compact">{num(b.totalVolume)} qty</div>
                        <div className="ba-broker-meta-compact">{b.stockCount} stocks</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* Zero-Sum Detection Engine */}
          {zeroSum.length > 0 && (
            <>
              <div className="ba-section-title-compact">
                <i className="fas fa-balance-scale-right" /> Zero-Sum Detection Engine (Top 10)
                {zeroSumSearch && filteredZeroSum.length > 0 && (
                  <span className="ba-match-badge" style={{ marginLeft: 8 }}>
                    {filteredZeroSum.length} result{filteredZeroSum.length !== 1 ? 's' : ''} for "{zeroSumSearch.toUpperCase()}"
                  </span>
                )}
                <div className="ba-mini-search" style={{ marginLeft: "auto" }}>
                  <i className="fas fa-search" />
                  <input 
                    value={zeroSumSearch} 
                    onChange={(e) => setZeroSumSearch(e.target.value)} 
                    placeholder="Search NEPSE stock..." 
                    list="nepse-stocks-list"
                  />
                  <datalist id="nepse-stocks-list">
                    {allStockSymbols.map((sym) => (
                      <option key={sym} value={sym} />
                    ))}
                  </datalist>
                </div>
              </div>
              <section className="ba-zero-sum-grid-compact">
                {filteredZeroSum.map((item, i) => {
                  const dominanceBarWidth = item.buyerPercent;
                  const barColor = dominanceBarWidth > 55 ? "var(--ba-green)" : dominanceBarWidth < 45 ? "var(--ba-red)" : "var(--ba-gold)";
                  
                  return (
                    <div key={i} className="ba-zero-sum-card-compact" style={{
                      borderColor: `${barColor}20`,
                    }}>
                      {/* Header: Stock + Status + Confidence */}
                      <div className="ba-zero-sum-header-compact">
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="ba-zero-sum-stock-compact">{item.stock}</span>
                          <span className="ba-zero-sum-status-compact" style={{
                            background: `${barColor}15`,
                            borderColor: `${barColor}40`,
                            color: barColor,
                          }}>
                            {item.statusEmoji} {item.status}
                          </span>
                        </div>
                        <span className="ba-zero-sum-confidence-compact" style={{ color: barColor }}>{item.confidence}%</span>
                      </div>

                      {/* Dominance Bar - Split green/red bar */}
                      <div style={{ marginBottom: 6 }}>
                        <div className="ba-zero-sum-labels-compact">
                          <span style={{ color: "var(--ba-green)", fontWeight: "700" }}>Buyer {item.buyerPercent}%</span>
                          <span style={{ color: "var(--ba-red)", fontWeight: "700" }}>Seller {item.sellerPercent}%</span>
                        </div>
                        <div className="ba-zero-sum-bar-compact" style={{
                          position: "relative",
                          overflow: "hidden",
                        }}>
                          {/* Buyer side - GREEN */}
                          <div style={{
                            position: "absolute",
                            left: 0, top: 0, bottom: 0,
                            width: `${item.buyerPercent}%`,
                            background: "var(--ba-green)",
                          }} />
                          {/* Seller side - RED */}
                          <div style={{
                            position: "absolute",
                            right: 0, top: 0, bottom: 0,
                            width: `${item.sellerPercent}%`,
                            background: "var(--ba-red)",
                          }} />
                          {/* Divider line at meeting point */}
                          <div style={{
                            position: "absolute",
                            left: `${item.buyerPercent}%`, top: 0, bottom: 0, width: 2,
                            background: "rgba(255,255,255,0.5)",
                            zIndex: 1,
                          }} />
                        </div>
                      </div>

                      {/* Compact Stats Row */}
                      <div className="ba-zero-sum-stats-compact">
                        <div className="ba-zero-sum-stat-compact">
                          <span>Net: </span>
                          <strong style={{ color: item.netValue >= 0 ? "var(--ba-green)" : "var(--ba-red)" }}>
                            {item.netValue >= 0 ? "+" : ""}{item.netValue} Cr
                          </strong>
                        </div>
                        <div className="ba-zero-sum-stat-compact">
                          <span>Buy/Sell: </span>
                          <span style={{ color: "var(--ba-green)" }}>{item.buyValue}</span>
                          <span style={{ color: "var(--ba-muted)", margin: "0 2px" }}>/</span>
                          <span style={{ color: "var(--ba-red)" }}>{item.sellValue} Cr</span>
                        </div>
                        <div className="ba-zero-sum-stat-compact">
                          <span>Battle: </span>
                          <strong style={{ color: "var(--ba-gold)" }}>{item.brokerBattle}</strong>
                        </div>
                        <div className="ba-zero-sum-stat-compact">
                          <span>Winner: </span>
                          <strong style={{ color: barColor }}>{item.winner.replace("Broker ", "#").replace(" slightly winning", "")}</strong>
                        </div>
                      </div>

                      {/* Internal Rotation Flag */}
                      {item.isInternalRotation && (
                        <div className="ba-rotation-badge-compact">
                          <i className="fas fa-sync-alt" />
                          Internal Rotation Detected
                        </div>
                      )}

                      {/* Top Brokers Breakdown */}
                      {item.topBrokers && item.topBrokers.length > 0 && (
                        <div className="ba-broker-breakdown" style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px solid var(--border)",
                        }}>
                          <div style={{
                            fontSize: "9px",
                            fontWeight: "700",
                            color: "var(--muted)",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                          }}>
                            <i className="fas fa-users" style={{ marginRight: "4px" }} />
                            Top Brokers
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {item.topBrokers.slice(0, 3).map((broker, idx) => {
                              const isNetBuyer = broker.netQty > 0;
                              return (
                                <div key={idx} style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  fontSize: "9px",
                                  padding: "2px 4px",
                                  background: isNetBuyer ? "var(--up-bg)" : "var(--down-bg)",
                                  borderRadius: "3px",
                                }}>
                                  <span style={{ fontWeight: "700", color: "var(--fg)" }}>
                                    #{broker.broker}
                                  </span>
                                  <span style={{ 
                                    fontWeight: "700", 
                                    color: isNetBuyer ? "var(--up)" : "var(--down)" 
                                  }}>
                                    {isNetBuyer ? "▲" : "▼"} {Math.abs(broker.netAmt)} Cr
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {/* Broker Stock Holdings Popup */}
          {selectedBroker && ba.data?.brokerNetHoldings && (
            <div className="ba-broker-popup-overlay" onClick={() => setSelectedBroker(null)} style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}>
              <div className="ba-broker-popup" onClick={(e) => e.stopPropagation()} style={{
                background: "var(--surface)",
                border: "2px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px",
                maxWidth: "500px",
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}>
                {/* Header */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  paddingBottom: "12px",
                  borderBottom: "2px solid var(--border)",
                }}>
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--fg)" }}>
                      <i className="fas fa-building" style={{ color: "var(--gold)", marginRight: "8px" }} />
                      Broker #{selectedBroker}
                    </div>
                    {(() => {
                      const broker = ba.data!.brokerNetHoldings.find(b => b.broker === selectedBroker);
                      if (!broker) return null;
                      const isBuyer = broker.netQty > 0;
                      return (
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                          {broker.stockCount} stocks · {num(broker.totalVolume)} qty · 
                          <span style={{ color: isBuyer ? "var(--up)" : "var(--down)", fontWeight: "700" }}>
                            {isBuyer ? "+" : ""}{broker.netAmt} Cr
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <button onClick={() => setSelectedBroker(null)} style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    color: "var(--muted)",
                  }}>
                    <i className="fas fa-times" />
                  </button>
                </div>

                {/* Stock Holdings List */}
                <div>
                  <div style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "var(--muted)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                  }}>
                    <i className="fas fa-chart-pie" style={{ marginRight: "4px" }} />
                    Top Stock Holdings
                  </div>
                  {(() => {
                    const broker = ba.data!.brokerNetHoldings.find(b => b.broker === selectedBroker);
                    if (!broker || !broker.topStocks || broker.topStocks.length === 0) {
                      return (
                        <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                          No stock holdings data available
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {broker.topStocks.map((stock, idx) => {
                          const isNetBuy = stock.netQty > 0;
                          return (
                            <div key={idx} style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              background: isNetBuy ? "var(--up-bg)" : "var(--down-bg)",
                              borderRadius: "6px",
                              border: `1px solid ${isNetBuy ? "var(--up-soft)" : "var(--down-soft)"}`,
                            }}>
                              <Link href={`/stock/${stock.symbol}`} style={{
                                fontWeight: "700",
                                fontSize: "14px",
                                color: "var(--fg)",
                                textDecoration: "none",
                              }}>
                                {stock.symbol}
                              </Link>
                              <div style={{ textAlign: "right" }}>
                                <div style={{
                                  fontWeight: "700",
                                  fontSize: "13px",
                                  color: isNetBuy ? "var(--up)" : "var(--down)",
                                }}>
                                  {isNetBuy ? "▲" : "▼"} {Math.abs(stock.netAmt).toFixed(2)} Cr
                                </div>
                                <div style={{
                                  fontSize: "10px",
                                  color: "var(--muted)",
                                }}>
                                  {num(Math.abs(stock.netQty))} qty
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
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
                  {(() => {
                    // Merge by unique stock symbol to avoid duplicates
                    const stockMap = new Map<string, { buy: typeof aggressiveBuy[0] | null; sell: typeof aggressiveSell[0] | null }>();
                    
                    aggressiveBuy.forEach(item => {
                      if (!stockMap.has(item.stock)) {
                        stockMap.set(item.stock, { buy: null, sell: null });
                      }
                      stockMap.get(item.stock)!.buy = item;
                    });
                    
                    aggressiveSell.forEach(item => {
                      if (!stockMap.has(item.stock)) {
                        stockMap.set(item.stock, { buy: null, sell: null });
                      }
                      stockMap.get(item.stock)!.sell = item;
                    });
                    
                    // Sort by total volume (buy + sell)
                    const sorted = [...stockMap.entries()]
                      .sort((a, b) => {
                        const aTotal = (a[1].buy?.volume || 0) + (a[1].sell?.volume || 0);
                        const bTotal = (b[1].buy?.volume || 0) + (b[1].sell?.volume || 0);
                        return bTotal - aTotal;
                      })
                      .slice(0, 50); // Top 50 unique stocks
                    
                    return sorted.map(([stock, data], i) => (
                      <tr key={stock}>
                        <td>{i + 1}</td>
                        <td><Link href={`/stock/${stock}`} className="ba-stock-link">{stock}</Link></td>
                        <td style={{ color: "var(--ba-green)" }}>#{data.buy?.broker || "-"}</td>
                        <td style={{ color: "var(--ba-green)" }}>{data.buy ? `+${data.buy.volume.toFixed(2)}` : "-"}</td>
                        <td style={{ color: "var(--ba-red)" }}>#{data.sell?.broker || "-"}</td>
                        <td style={{ color: "var(--ba-red)" }}>{data.sell ? `${data.sell.volume.toFixed(2)}` : "-"}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            ) : <div className="ba-no-results">{ba.loading ? "Loading floorsheet data..." : "No floorsheet data available"}</div>}
          </section>

          {/* Zero-Sum Stocks */}
          {zeroSum.length > 0 && (
            <>
              <div className="ba-section-title">
                <i className="fas fa-balance-scale" /> Contested Stocks (Buy vs Sell)
                {/* Stock Search Bar */}
                <div className="ba-mini-search" style={{ marginLeft: 12 }}>
                  <i className="fas fa-search" />
                  <input
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    placeholder="Search NEPSE stock..."
                    style={{ width: 180 }}
                  />
                </div>
                {stockSearch && <span className="ba-match-badge" style={{ marginLeft: 8 }}>{filteredZeroSum.length}</span>}
                <span className="ba-section-line" />
              </div>
              <section className="ba-order-card" style={{ marginBottom: 22 }}>
                {filteredZeroSum.length > 0 ? filteredZeroSum.map((item, i) => (
                  <div key={i} className="ba-week-item">
                    <div className="ba-week-head">
                      <span className="ba-week-stock"><Link href={`/stock/${item.stock}`}>{item.stock}</Link></span>
                      <span className="ba-week-vol">Buyer: #{item.buyer} vs Seller: #{item.seller}</span>
                    </div>
                    <div className="ba-week-bar-wrap">
                      <div className="ba-week-marker" style={{
                        left: `${item.buyerPercent}%`,
                        background: item.netValue >= 0 ? "var(--ba-green)" : "var(--ba-red)",
                      }} />
                    </div>
                    <div className="ba-week-labels">
                      <span style={{ color: "var(--ba-red)" }}>Sell: #{item.seller}</span>
                      <span style={{ color: item.netValue >= 0 ? "var(--ba-green)" : "var(--ba-red)", fontWeight: 700 }}>Net: {item.netValue >= 0 ? "+" : ""}{item.netValue} Cr</span>
                      <span style={{ color: "var(--ba-green)" }}>Buy: #{item.buyer}</span>
                    </div>
                  </div>
                )) : (
                  <div className="ba-no-results">
                    {stockSearch ? `No matches for "${stockSearch}"` : "No contested stocks detected"}
                  </div>
                )}
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

      const top = favorites.slice(0, 50);
      const colors = ["#3bdd9a", "#4b8cfa", "#f56b7a", "#f5b842", "#a78bfa", "#f59e0b", "#06b6d4", "#ec4899", "#10b981", "#8b5cf6", "#ef4444", "#f97316"];

      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: top.map((b) => `#${b.broker}`),
          datasets: [{
            label: "Top Stocks Count",
            data: top.map((b) => b.favorites.length),
            backgroundColor: top.map((_, i) => colors[i % colors.length]),
            borderRadius: 6,
            barThickness: 18,
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

  return <div style={{ height: Math.max(300, Math.min(favorites.length * 28, 800)) }}><canvas ref={canvasRef} /></div>;
}
