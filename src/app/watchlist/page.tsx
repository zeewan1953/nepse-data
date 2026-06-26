"use client";
import { useState, useEffect } from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";

type WatchlistStock = {
  symbol: string;
  addedAt: string;
};

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Fetch live market data
  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);

  useEffect(() => {
    setMounted(true);
    // Load watchlist from localStorage
    const saved = localStorage.getItem("watchlist");
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load watchlist:", e);
      }
    }
  }, []);

  // Save watchlist to localStorage whenever it changes
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem("watchlist", JSON.stringify(watchlist));
    } else {
      localStorage.removeItem("watchlist");
    }
  }, [watchlist]);

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.find((s) => s.symbol === symbol)) {
      setWatchlist([...watchlist, { symbol, addedAt: new Date().toISOString() }]);
      setSearchQuery("");
      setShowSearch(false);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter((s) => s.symbol !== symbol));
  };

  // Get live data for watchlist stocks
  const watchlistData = live.data?.data.filter((d) => 
    watchlist.some((w) => w.symbol === d.symbol)
  ) || [];

  // Filter search results
  const searchResults = live.data?.data.filter((d) => {
    const matchesSearch = d.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.securityName || "").toLowerCase().includes(searchQuery.toLowerCase());
    const notInWatchlist = !watchlist.find((w) => w.symbol === d.symbol);
    return matchesSearch && notInWatchlist && !/\d/.test(d.symbol);
  }).slice(0, 10) || [];

  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 md:p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">⭐ Watchlist</h1>
            <p className="text-xs md:text-sm text-muted mt-1">Track your favorite stocks</p>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-semibold"
          >
            {showSearch ? "✕ Cancel" : "+ Add Stock"}
          </button>
        </div>

        {/* Search Panel */}
        {showSearch && (
          <div className="rounded-lg border border-border bg-surface p-4 mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3">Search Stocks</h2>
            <input
              type="text"
              placeholder="Search by symbol or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3"
              autoFocus
            />
            
            {searchQuery && searchResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 transition cursor-pointer"
                    onClick={() => addToWatchlist(stock.symbol)}
                  >
                    <div>
                      <div className="font-semibold text-foreground text-sm">{stock.symbol}</div>
                      <div className="text-[10px] text-muted">{stock.securityName}</div>
                    </div>
                    <button className="px-3 py-1 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90">
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery && searchResults.length === 0 && (
              <div className="text-center py-8 text-muted text-sm">
                No stocks found
              </div>
            )}
          </div>
        )}

        {/* Watchlist Table */}
        {watchlist.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center">
            <div className="text-6xl mb-4">⭐</div>
            <h2 className="text-xl font-bold text-foreground mb-2">Your Watchlist is Empty</h2>
            <p className="text-sm text-muted mb-4">Add stocks to track their performance</p>
            <button
              onClick={() => setShowSearch(true)}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-semibold"
            >
              + Add Your First Stock
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border bg-surface-2 text-[10px] font-bold text-muted uppercase tracking-wide">
              <div className="col-span-2">Symbol</div>
              <div className="col-span-2 text-right">LTP</div>
              <div className="col-span-2 text-right">Change</div>
              <div className="col-span-2 text-right">Volume</div>
              <div className="col-span-2 text-right">Turnover</div>
              <div className="col-span-2 text-center">Action</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
              {watchlistData.map((stock) => {
                const changePos = stock.percentageChange > 0;
                const changeNeg = stock.percentageChange < 0;

                return (
                  <div
                    key={stock.symbol}
                    className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-surface-2 transition"
                  >
                    <div className="col-span-2">
                      <div className="font-semibold text-foreground text-sm">{stock.symbol}</div>
                      <div className="text-[9px] text-muted truncate">{stock.securityName}</div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="text-sm font-bold text-foreground">
                        Rs. {stock.lastTradedPrice?.toFixed(2) || "0.00"}
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className={`text-xs font-bold ${changePos ? "text-green-600" : changeNeg ? "text-red-600" : "text-gray-600"}`}>
                        {changePos ? "+" : ""}{stock.percentageChange?.toFixed(2) || "0.00"}%
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="text-xs text-foreground">
                        {(stock.totalTradeQuantity || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="text-xs text-foreground">
                        Rs. {((stock.totalTradeValue || 0) / 100000).toFixed(2)}L
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <button
                        onClick={() => removeFromWatchlist(stock.symbol)}
                        className="px-3 py-1 bg-red-500/10 text-red-600 rounded text-xs font-semibold hover:bg-red-500/20 transition"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Show stocks without live data */}
              {watchlist
                .filter((w) => !watchlistData.find((d) => d.symbol === w.symbol))
                .map((w) => (
                  <div
                    key={w.symbol}
                    className="grid grid-cols-12 gap-2 px-4 py-3 opacity-50"
                  >
                    <div className="col-span-2">
                      <div className="font-semibold text-foreground text-sm">{w.symbol}</div>
                    </div>
                    <div className="col-span-10 flex items-center justify-end">
                      <span className="text-xs text-muted">No data available</span>
                      <button
                        onClick={() => removeFromWatchlist(w.symbol)}
                        className="ml-4 px-3 py-1 bg-red-500/10 text-red-600 rounded text-xs font-semibold hover:bg-red-500/20 transition"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 rounded-lg border border-border bg-surface-2 p-4 text-center">
          <p className="text-xs text-muted">
            {watchlist.length} {watchlist.length === 1 ? "stock" : "stocks"} in watchlist • 
            Auto-refreshes every 30 seconds
          </p>
        </div>
      </main>
    </div>
  );
}
