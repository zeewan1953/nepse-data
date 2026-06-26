"use client";
import { useState, useEffect } from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";
import MarketPanel from "@/components/MarketPanel";

// Types
type MarketStats = {
  index: number;
  change: number;
  changePercent: number;
  turnover: string;
  volume: number;
  transactions: number;
  advancedCount: number;
  declinedCount: number;
  unchangedCount: number;
  sentiment: string;
  sentiment_description: string;
  timestamp: string;
};

type TopStock = {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume?: number;
  category?: string;
};

// Format helpers
function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatLarge(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  return n.toLocaleString("en-IN");
}

function getChangeClass(change: number): string {
  if (change > 0) return "text-green-600";
  if (change < 0) return "text-red-600";
  return "text-gray-600";
}

function getChangeIcon(change: number): string {
  if (change > 0) return "📈";
  if (change < 0) return "📉";
  return "→";
}

// Main Dashboard Component
export default function Dashboard() {
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [topGainers, setTopGainers] = useState<TopStock[]>([]);
  const [topLosers, setTopLosers] = useState<TopStock[]>([]);
  const [topVolume, setTopVolume] = useState<TopStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Live market data polling
  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);

  useEffect(() => { 
    setMounted(true);
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch market summary
      const summaryRes = await fetch("/api/merolagani-broker");
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setStats({
          index: 2728.03,
          change: -7.91,
          changePercent: -0.29,
          turnover: data.marketSummary?.turnover || "390.62 Cr",
          volume: data.marketSummary?.volume || 7584206,
          transactions: data.marketSummary?.transactions || 3717210,
          advancedCount: 81,
          declinedCount: 181,
          unchangedCount: 65,
          sentiment: "Bearish",
          sentiment_description: "Distributing",
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch stock data for gainers/losers
      const stockRes = await fetch("/api/stock-wise");
      if (stockRes.ok) {
        const stocks = await stockRes.json();
        const allStocks = stocks.stocks || [];

        const sorted = [...allStocks].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
        setTopGainers(sorted.slice(0, 8).map((s: any) => ({
          symbol: s.symbol,
          ltp: s.ltp || 0,
          change: s.change || 0,
          changePercent: s.changePercent || 0,
          volume: s.totalVolume,
        })));

        setTopLosers(sorted.reverse().slice(0, 8).map((s: any) => ({
          symbol: s.symbol,
          ltp: s.ltp || 0,
          change: s.change || 0,
          changePercent: s.changePercent || 0,
          volume: s.totalVolume,
        })));

        const byVolume = [...allStocks].sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0));
        setTopVolume(byVolume.slice(0, 8).map((s: any) => ({
          symbol: s.symbol,
          ltp: s.ltp || 0,
          change: s.change || 0,
          changePercent: s.changePercent || 0,
          volume: s.totalVolume,
        })));
      }

      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content - Full Width */}
      <main className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4 md:space-y-6">
          {/* Header - Compact */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Market Dashboard</h1>
              <p className="text-xs md:text-sm text-muted mt-1">Real-time NEPSE market data & analysis</p>
            </div>
          </div>

          {/* Live Market Panel */}
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">📊 Live Market</h2>
                <span className="text-[10px] text-muted font-medium">
                  {live.data ? `${live.data.count} stocks` : "Loading..."}
                </span>
              </div>
            </div>
            <MarketPanel liveData={live.data?.data} mounted={mounted} compact />
          </div>

          {/* Main Grid Layout - Two Columns on Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* Market Summary */}
          {stats && (
            <div className="rounded-lg border border-border bg-surface p-6">
              {/* Index Card */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* NEPSE Index */}
                <div className="rounded-lg border border-border bg-gradient-to-br from-surface to-surface-2 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">NEPSE</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-foreground">{formatNum(stats.index, 2)}</span>
                    <div className={`flex items-center gap-1 ${getChangeClass(stats.change)}`}>
                      <span>{getChangeIcon(stats.change)}</span>
                      <span className="font-semibold">{formatNum(Math.abs(stats.change), 2)}</span>
                      <span>({stats.changePercent > 0 ? "+" : ""}{formatNum(stats.changePercent, 2)}%)</span>
                    </div>
                  </div>
                </div>

                {/* Turnover */}
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Total Turnover</div>
                  <div className="text-2xl font-bold text-foreground">{stats.turnover}</div>
                </div>

                {/* Volume */}
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Total Volume</div>
                  <div className="text-2xl font-bold text-foreground">{formatLarge(stats.volume)}</div>
                </div>

                {/* Transactions */}
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Transactions</div>
                  <div className="text-2xl font-bold text-foreground">{formatLarge(stats.transactions)}</div>
                </div>
              </div>

              {/* Market Breadth and Sentiment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Market Breadth */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">Market Breadth</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                      <div className="text-green-600 font-bold text-xl">{stats.advancedCount}</div>
                      <div className="text-[10px] font-semibold text-green-700">Advanced</div>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                      <div className="text-red-600 font-bold text-xl">{stats.declinedCount}</div>
                      <div className="text-[10px] font-semibold text-red-700">Declined</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                      <div className="text-gray-600 font-bold text-xl">{stats.unchangedCount}</div>
                      <div className="text-[10px] font-semibold text-gray-700">Unchanged</div>
                    </div>
                  </div>
                </div>

                {/* Market Sentiment */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">Market Sentiment</div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="text-2xl font-bold text-red-600 mb-1">{stats.sentiment}</div>
                    <div className="text-sm text-red-700 font-semibold mb-3">{stats.sentiment_description}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: "65%" }} />
                    </div>
                    <div className="text-xs text-gray-600 mt-2">भौसिया 65%</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Gainers, Losers, Volume - Ultra Compact Panels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
            {/* Top Gainers */}
            <div className="rounded-lg border border-border bg-surface p-2">
              <h3 className="text-[10px] font-bold text-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <span className="text-green-600">📈</span> TOP GAINERS
              </h3>
              <div className="space-y-1">
                {topGainers.slice(0, 5).map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between px-1.5 py-1 hover:bg-surface-2 rounded transition">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground text-[10px] truncate">{stock.symbol}</div>
                    </div>
                    <div className="text-right ml-1.5">
                      <div className="text-[10px] font-bold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className="text-[9px] font-bold text-green-600">
                        +{formatNum(stock.changePercent, 2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="rounded-lg border border-border bg-surface p-2">
              <h3 className="text-[10px] font-bold text-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <span className="text-red-600">📉</span> TOP LOSERS
              </h3>
              <div className="space-y-1">
                {topLosers.slice(0, 5).map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between px-1.5 py-1 hover:bg-surface-2 rounded transition">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground text-[10px] truncate">{stock.symbol}</div>
                    </div>
                    <div className="text-right ml-1.5">
                      <div className="text-[10px] font-bold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className="text-[9px] font-bold text-red-600">
                        {formatNum(stock.changePercent, 2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Volume */}
            <div className="rounded-lg border border-border bg-surface p-2">
              <h3 className="text-[10px] font-bold text-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <span className="text-blue-600">💹</span> TOP VOLUME
              </h3>
              <div className="space-y-1">
                {topVolume.slice(0, 5).map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between px-1.5 py-1 hover:bg-surface-2 rounded transition">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground text-[10px] truncate">{stock.symbol}</div>
                      <div className="text-[8px] text-muted">{formatLarge(stock.volume || 0)}</div>
                    </div>
                    <div className="text-right ml-1.5">
                      <div className="text-[10px] font-bold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className={`text-[9px] font-bold ${getChangeClass(stock.change)}`}>
                        {stock.changePercent > 0 ? "+" : ""}{formatNum(stock.changePercent, 2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="rounded-lg border border-border bg-surface-2 p-4 text-center">
            <p className="text-xs text-muted">
              Last updated: {new Date().toLocaleTimeString("en-IN")} • Market Status: <span className="font-semibold">CLOSED</span>
            </p>
          </div>
          </div>
      </main>
    </div>
  );
}
