"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

// Types
type NavItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
};

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

// Navigation items
const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { id: "market", label: "Market", icon: "📈", href: "/market" },
  { id: "watchlist", label: "Watchlist", icon: "⭐", href: "/watchlist" },
  { id: "portfolio", label: "Portfolio", icon: "🏢", href: "/portfolio" },
  { id: "orders", label: "Orders", icon: "📋", href: "/orders" },
  { id: "screener", label: "Screener", icon: "⚡", href: "/screener" },
  { id: "ipo", label: "IPO", icon: "🔔", href: "/ipo" },
  { id: "settings", label: "Settings", icon: "⚙️", href: "/settings" },
];

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
  const [active, setActive] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [topGainers, setTopGainers] = useState<TopStock[]>([]);
  const [topLosers, setTopLosers] = useState<TopStock[]>([]);
  const [topVolume, setTopVolume] = useState<TopStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

          {/* Top Gainers, Losers, Volume */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Gainers */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">TOP GAINERS</h3>
              <div className="space-y-2">
                {topGainers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 hover:bg-surface-2 rounded transition">
                    <div>
                      <div className="font-semibold text-foreground text-sm">{stock.symbol}</div>
                      <div className="text-[10px] text-muted">
                        {stock.category || "Listed"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className="text-xs font-semibold text-green-600">
                        +{formatNum(Math.abs(stock.change), 2)} (+{formatNum(stock.changePercent, 2)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">TOP LOSERS</h3>
              <div className="space-y-2">
                {topLosers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 hover:bg-surface-2 rounded transition">
                    <div>
                      <div className="font-semibold text-foreground text-sm">{stock.symbol}</div>
                      <div className="text-[10px] text-muted">
                        {stock.category || "Listed"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className="text-xs font-semibold text-red-600">
                        {formatNum(stock.change, 2)} ({formatNum(stock.changePercent, 2)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Volume */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">TOP VOLUME</h3>
              <div className="space-y-2">
                {topVolume.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 hover:bg-surface-2 rounded transition">
                    <div>
                      <div className="font-semibold text-foreground text-sm">{stock.symbol}</div>
                      <div className="text-[10px] text-muted">
                        Vol: {formatLarge(stock.volume || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-foreground">{formatNum(stock.ltp, 2)}</div>
                      <div className={`text-xs font-semibold ${getChangeClass(stock.change)}`}>
                        {stock.change > 0 ? "+" : ""}{formatNum(stock.change, 2)} ({stock.changePercent > 0 ? "+" : ""}{formatNum(stock.changePercent, 2)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Market Calendar / Timeline */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Market Calendar (2083 Jestha)</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() + i);
                const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
                const dateStr = date.getDate();

                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
                      i === 0
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    } min-w-fit cursor-pointer transition`}
                  >
                    <div className="text-xs font-semibold text-muted">{day}</div>
                    <div className="text-lg font-bold text-foreground">{dateStr}</div>
                    <div className="text-[10px] text-muted">2083</div>
                  </div>
                );
              })}
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
