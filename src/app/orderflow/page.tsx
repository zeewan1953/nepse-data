"use client";
import { useState, useEffect } from "react";
import { getMarketSession } from "@/lib/market-hours";

type OrderFlowData = {
  buy_pressure: number;
  sell_pressure: number;
  imbalance: number;
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS";
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  large_orders: Array<{ price: number; qty: number; type: "buy" | "sell" }>;
  liquidity_walls: Array<{ price: number; qty: number; type: "support" | "resistance" }>;
  ltp: number;
  total_buy_qty: number;
  total_sell_qty: number;
  total_trades: number;
};

type MarketDepthData = {
  total_bid_qty: number;
  total_ask_qty: number;
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
};

type StockInfo = {
  symbol: string;
  name: string;
  ltp: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
};

function getTrendEmoji(trend: string) {
  if (trend === "BULLISH") return "🟢";
  if (trend === "BEARISH") return "🔴";
  return "⚪";
}

function getSignalEmoji(signal: string) {
  if (signal === "STRONG_BUY") return "🔥";
  if (signal === "BUY") return "📈";
  if (signal === "STRONG_SELL") return "💧";
  if (signal === "SELL") return "📉";
  return "⚖️";
}

function getSignalColor(signal: string) {
  if (signal === "STRONG_BUY" || signal === "BUY") return "bg-green-50 text-green-700 border-green-200";
  if (signal === "STRONG_SELL" || signal === "SELL") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

export default function OrderFlowPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [orderFlow, setOrderFlow] = useState<OrderFlowData | null>(null);
  const [marketDepth, setMarketDepth] = useState<MarketDepthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);

  // Check market session
  useEffect(() => {
    setMounted(true);
    const checkMarket = () => {
      const session = getMarketSession();
      setIsMarketOpen(session === "open");
    };
    checkMarket();
    const interval = setInterval(checkMarket, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all stocks on mount
  useEffect(() => {
    fetchStocks();
  }, []);

  const fetchStocks = async () => {
    try {
      const res = await fetch("/api/live");
      const data = await res.json();
      if (data?.data) {
        const stockList = data.data
          .filter((s: any) => s.lastTradedPrice > 0)
          .map((s: any) => ({
            symbol: s.symbol,
            name: s.securityName || s.symbol,
            ltp: s.lastTradedPrice,
            high: s.highPrice || 0,
            low: s.lowPrice || 0,
            close: s.previousClose || 0,
            change: s.percentageChange || 0,
            volume: s.totalTradeQuantity || 0,
          }))
          .sort((a: StockInfo, b: StockInfo) => a.symbol.localeCompare(b.symbol));
        
        setStocks(stockList);
      }
    } catch (e) {
      console.error("Failed to fetch stocks:", e);
    }
  };

  // Search stocks
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    const q = searchQuery.toLowerCase();
    const results = stocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 10);
    
    setSearchResults(results);
  }, [searchQuery, stocks]);

  // Fetch order flow for selected symbol
  const fetchOrderFlow = async (symbol: string) => {
    if (!symbol) return;
    
    setLoading(true);
    setSelectedSymbol(symbol);
    setSearchQuery("");
    setSearchResults([]);
    
    try {
      // Fetch market depth
      const depthRes = await fetch(`/api/security/${symbol}`);
      const depthData = await depthRes.json();
      
      if (depthData?.depth) {
        const depth = depthData.depth;
        setMarketDepth({
          total_bid_qty: depth.bids?.reduce((sum: number, b: any) => sum + (b.quantity || 0), 0) || 0,
          total_ask_qty: depth.asks?.reduce((sum: number, a: any) => sum + (a.quantity || 0), 0) || 0,
          bids: depth.bids?.slice(0, 5).map((b: any) => ({ price: b.price, qty: b.quantity })) || [],
          asks: depth.asks?.slice(0, 5).map((a: any) => ({ price: a.price, qty: a.quantity })) || [],
        });
      }
      
      // Fetch floorsheet
      const floorsheetRes = await fetch(`/api/floorsheet?symbol=${symbol}&size=200`);
      const floorsheetData = await floorsheetRes.json();
      
      console.log('[OrderFlow] Floorsheet response:', {
        hasFloorsheets: !!floorsheetData?.floorsheets,
        hasContent: !!floorsheetData?.floorsheets?.content,
        contentLength: floorsheetData?.floorsheets?.content?.length || 0,
        directContent: floorsheetData?.content?.length || 0,
      });
      
      const stockInfo = stocks.find((s) => s.symbol === symbol);
      if (!stockInfo) {
        console.error('[OrderFlow] Stock not found:', symbol);
        setLoading(false);
        return;
      }
      
      // Process floorsheet
      const trades = floorsheetData?.floorsheets?.content || floorsheetData?.content || [];
      console.log('[OrderFlow] Processing trades:', trades.length, 'for', symbol);
      
      let total_buy_qty = 0;
      const large_orders: OrderFlowData["large_orders"] = [];
      const priceLevels = new Map<number, number>();
      
      for (const trade of trades) {
        const qty = trade.contractQuantity || trade.quantity || 0;
        const rate = trade.contractRate || trade.rate || 0;
        
        if (qty > 0 && rate > 0) {
          total_buy_qty += qty;
          
          if (qty >= 5000) {
            large_orders.push({ price: rate, qty, type: "buy" });
          }
          
          priceLevels.set(rate, (priceLevels.get(rate) || 0) + qty);
        }
      }
      
      console.log('[OrderFlow] Processed:', {
        total_buy_qty,
        stock_volume: stockInfo.volume,
        large_orders: large_orders.length,
        price_levels: priceLevels.size,
      });
      
      const total_sell_qty = Math.max(0, stockInfo.volume - total_buy_qty);
      const total_volume = total_buy_qty + total_sell_qty;
      const buy_pressure = total_volume > 0 ? total_buy_qty / total_volume : 0.5;
      const sell_pressure = 1 - buy_pressure;
      const imbalance = buy_pressure - sell_pressure;
      
      let trend: OrderFlowData["trend"];
      if (imbalance > 0.3) trend = "BULLISH";
      else if (imbalance < -0.3) trend = "BEARISH";
      else trend = "SIDEWAYS";
      
      let signal: OrderFlowData["signal"];
      if (imbalance > 0.5) signal = "STRONG_BUY";
      else if (imbalance > 0.3) signal = "BUY";
      else if (imbalance < -0.5) signal = "STRONG_SELL";
      else if (imbalance < -0.3) signal = "SELL";
      else signal = "NEUTRAL";
      
      const liquidity_walls = Array.from(priceLevels.entries())
        .filter(([_, qty]) => qty > 10000)
        .map(([price, qty]) => ({
          price,
          qty,
          type: price < stockInfo.ltp ? "support" : "resistance" as "support" | "resistance",
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      
      setOrderFlow({
        buy_pressure: Math.round(buy_pressure * 1000) / 1000,
        sell_pressure: Math.round(sell_pressure * 1000) / 1000,
        imbalance: Math.round(imbalance * 1000) / 1000,
        trend,
        signal,
        large_orders: large_orders.slice(0, 10),
        liquidity_walls,
        ltp: stockInfo.ltp,
        total_buy_qty,
        total_sell_qty,
        total_trades: trades.length,
      });
      
    } catch (e) {
      console.error("Failed to fetch order flow:", e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh during market hours
  useEffect(() => {
    if (!selectedSymbol || !isMarketOpen) return;
    
    const interval = setInterval(() => {
      fetchOrderFlow(selectedSymbol);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [selectedSymbol, isMarketOpen]);

  const currentStock = stocks.find((s) => s.symbol === selectedSymbol);

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📊 Order Flow Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isMarketOpen ? (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 bg-green-500" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                Market Open — Real-time
              </span>
            ) : (
              <span>Market Closed — Last traded data</span>
            )}
          </p>
        </div>
        
        {/* Selected Stock Badge */}
        {selectedSymbol && currentStock && (
          <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
            <div>
              <span className="font-bold text-primary text-sm">{selectedSymbol}</span>
              <span className="ml-2 text-xs text-gray-500">{currentStock.name}</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-sm">₨{currentStock.ltp.toFixed(2)}</div>
              <div className={`text-xs font-bold ${currentStock.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                {currentStock.change >= 0 ? "+" : ""}{currentStock.change.toFixed(2)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-4 relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search by company name or symbol..."
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        
        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {searchResults.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => fetchOrderFlow(stock.symbol)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-primary text-sm">{stock.symbol}</span>
                  <span className="ml-2 text-xs text-gray-500">{stock.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">₨{stock.ltp.toFixed(2)}</div>
                  <div className={`text-xs font-bold ${stock.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!mounted ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      ) : !selectedSymbol ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Select a Stock</h2>
          <p className="text-xs text-gray-500">Search for a company name or symbol to view order flow</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-gray-500">Loading {selectedSymbol} data...</div>
        </div>
      ) : orderFlow && currentStock ? (
        <div className="space-y-4">
          {/* Stock Info */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow p-4 text-white">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h2 className="text-2xl font-bold mb-0.5">{currentStock.symbol}</h2>
                <p className="text-xs opacity-90">{currentStock.name}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">₨{currentStock.ltp.toFixed(2)}</div>
                <div className={`text-base font-bold ${currentStock.change >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {currentStock.change >= 0 ? "+" : ""}{currentStock.change.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-white/20 text-sm">
              <div>
                <p className="text-xs opacity-75">High</p>
                <p className="font-semibold">₨{currentStock.high.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs opacity-75">Low</p>
                <p className="font-semibold">₨{currentStock.low.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs opacity-75">Close</p>
                <p className="font-semibold">₨{currentStock.close.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs opacity-75">Volume</p>
                <p className="font-semibold">{currentStock.volume.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Main Grid: Order Flow + Market Depth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Order Flow */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">📊 Order Flow Analysis</h2>
                <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-300">
                  Estimated
                </span>
              </div>

              {/* Buy Pressure */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-green-700 uppercase">Buy Pressure</span>
                  <span className="text-xl font-bold text-green-600">{(orderFlow.buy_pressure * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-400 to-green-600 h-full transition-all duration-500"
                    style={{ width: `${orderFlow.buy_pressure * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Qty: {orderFlow.total_buy_qty.toLocaleString()}</p>
              </div>

              {/* Sell Pressure */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-red-700 uppercase">Sell Pressure</span>
                  <span className="text-xl font-bold text-red-600">{(orderFlow.sell_pressure * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-400 to-red-600 h-full transition-all duration-500"
                    style={{ width: `${orderFlow.sell_pressure * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Qty: {orderFlow.total_sell_qty.toLocaleString()}</p>
              </div>

              {/* Trend & Signal */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase mb-1">Trend</p>
                  <p className="text-lg font-bold flex items-center gap-1.5">
                    <span>{orderFlow.trend}</span>
                    <span className="text-2xl">{getTrendEmoji(orderFlow.trend)}</span>
                  </p>
                </div>
                <div className={`rounded-lg p-3 border ${getSignalColor(orderFlow.signal)}`}>
                  <p className="text-xs text-gray-500 uppercase mb-1">Signal</p>
                  <p className="text-lg font-bold flex items-center gap-1.5">
                    <span>{orderFlow.signal}</span>
                    <span className="text-2xl">{getSignalEmoji(orderFlow.signal)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Trades:</span>
                  <span className="ml-1 font-semibold">{orderFlow.total_trades}</span>
                </div>
                <div>
                  <span className="text-gray-500">Imbalance:</span>
                  <span className="ml-1 font-semibold">{(orderFlow.imbalance * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Market Depth */}
            {marketDepth ? (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-4">📈 Market Depth</h2>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="text-xs text-green-700 uppercase mb-1">Total Bid</p>
                    <p className="text-lg font-bold text-green-900">{marketDepth.total_bid_qty.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                    <p className="text-xs text-red-700 uppercase mb-1">Total Ask</p>
                    <p className="text-lg font-bold text-red-900">{marketDepth.total_ask_qty.toLocaleString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-green-700 mb-2 uppercase border-b-2 border-green-500 pb-1">Top Bids</p>
                    <div className="space-y-1.5">
                      {marketDepth.bids.length > 0 ? marketDepth.bids.map((bid, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-green-50 rounded px-2 py-1.5 border border-green-200">
                          <span className="text-green-700 font-semibold text-xs">₨{bid.price.toFixed(2)}</span>
                          <span className="text-gray-800 font-medium text-xs">{bid.qty.toLocaleString()}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-gray-500 py-4 text-center">No data</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-red-700 mb-2 uppercase border-b-2 border-red-500 pb-1">Top Asks</p>
                    <div className="space-y-1.5">
                      {marketDepth.asks.length > 0 ? marketDepth.asks.map((ask, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-red-50 rounded px-2 py-1.5 border border-red-200">
                          <span className="text-red-700 font-semibold text-xs">₨{ask.price.toFixed(2)}</span>
                          <span className="text-gray-800 font-medium text-xs">{ask.qty.toLocaleString()}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-gray-500 py-4 text-center">No data</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-center">
                <p className="text-xs text-gray-500">Market depth not available</p>
              </div>
            )}
          </div>

          {/* Analytics Grid */}
          {(orderFlow.large_orders.length > 0 || orderFlow.liquidity_walls.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {orderFlow.large_orders.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h2 className="text-sm font-bold text-gray-900 mb-3">🎯 Large Orders (&gt;5K)</h2>
                  <div className="space-y-2">
                    {orderFlow.large_orders.slice(0, 5).map((order, idx) => (
                      <div key={idx} className="flex justify-between items-center rounded p-2 bg-green-50 border border-green-200">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Buy</p>
                          <p className="text-sm font-bold">₨{order.price.toFixed(2)}</p>
                        </div>
                        <p className="text-sm font-bold text-green-600">{order.qty.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {orderFlow.liquidity_walls.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h2 className="text-sm font-bold text-gray-900 mb-3"> Liquidity Walls (&gt;10K)</h2>
                  <div className="space-y-2">
                    {orderFlow.liquidity_walls.map((wall, idx) => (
                      <div key={idx} className={`flex justify-between items-center rounded p-2 border ${
                        wall.type === "support" ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"
                      }`}>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">{wall.type === "support" ? "Support" : "Resistance"}</p>
                          <p className="text-sm font-bold">₨{wall.price.toFixed(2)}</p>
                        </div>
                        <p className="text-sm font-bold">{wall.qty.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
