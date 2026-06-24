"use client";

import { useState, useEffect } from "react";

type OrderFlowData = {
  symbol: string;
  buy_pressure: number;
  sell_pressure: number;
  imbalance: number;
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS";
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  large_orders?: any;
  liquidity_walls?: any;
  timestamp: string;
};

type MarketDepth = {
  symbol: string;
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
  total_bid_qty: number;
  total_ask_qty: number;
};

export default function Home() {
  const [symbols] = useState(["NABIL", "SCB", "HBL", "GBL", "NICA"]);
  const [selectedSymbol, setSelectedSymbol] = useState("NABIL");
  const [orderFlow, setOrderFlow] = useState<OrderFlowData | null>(null);
  const [marketDepth, setMarketDepth] = useState<MarketDepth | null>(null);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Simulate data (replace with actual API calls)
  useEffect(() => {
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      // Mock order flow data
      const mockOrderFlow: OrderFlowData = {
        symbol: selectedSymbol,
        buy_pressure: 0.62,
        sell_pressure: 0.38,
        imbalance: 0.24,
        trend: "BULLISH",
        signal: "BUY",
        large_orders: {
          large_bids: [{ price: 950, qty: 5000, size_ratio: 3.2 }],
          large_asks: []
        },
        liquidity_walls: {
          bid_wall: { price: 948, qty: 15000, strength: "STRONG" },
          ask_wall: null
        },
        timestamp: new Date().toISOString()
      };

      // Mock market depth
      const mockDepth: MarketDepth = {
        symbol: selectedSymbol,
        bids: [
          { price: 950, qty: 1000 },
          { price: 949, qty: 500 },
          { price: 948, qty: 15000 },
          { price: 947, qty: 800 },
          { price: 946, qty: 600 }
        ],
        asks: [
          { price: 952, qty: 1200 },
          { price: 953, qty: 800 },
          { price: 954, qty: 900 },
          { price: 955, qty: 700 },
          { price: 956, qty: 500 }
        ],
        total_bid_qty: 17900,
        total_ask_qty: 4100
      };

      setOrderFlow(mockOrderFlow);
      setMarketDepth(mockDepth);
      setLoading(false);
      setWsConnected(true);
    }, 500);
  }, [selectedSymbol]);

  const getTrendEmoji = (trend: string) => {
    switch (trend) {
      case "BULLISH": return "🟢";
      case "BEARISH": return "🔴";
      default: return "🟡";
    }
  };

  const getSignalEmoji = (signal: string) => {
    switch (signal) {
      case "STRONG_BUY": return "🔥🔥";
      case "BUY": return "🔥";
      case "NEUTRAL": return "⚪";
      case "SELL": return "💧";
      case "STRONG_SELL": return "💧💧";
      default: return "⚪";
    }
  };

  const getSignalColor = (signal: string) => {
    if (signal.includes("BUY")) return "text-green-600 bg-green-50";
    if (signal.includes("SELL")) return "text-red-600 bg-red-50";
    return "text-gray-600 bg-gray-50";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                📊 NEPSE Order Flow Analytics
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time trading signals & market depth
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`}></div>
                <span className="text-sm text-gray-600">{wsConnected ? "Live" : "Disconnected"}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Symbol Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Symbol
          </label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading market data...</p>
          </div>
        ) : (
          <>
            {/* Order Flow Dashboard */}
            {orderFlow && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Buy/Sell Pressure */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">
                    📊 Order Flow Analysis
                  </h2>
            
                  {/* Buy Pressure */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                        Buy Pressure
                      </span>
                      <span className="text-3xl font-bold text-green-600">
                        {(orderFlow.buy_pressure * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden shadow-inner">
                      <div
                        className="bg-gradient-to-r from-green-400 via-green-500 to-green-600 h-full transition-all duration-500 rounded-full"
                        style={{ width: `${orderFlow.buy_pressure * 100}%` }}
                      ></div>
                    </div>
                  </div>
            
                  {/* Sell Pressure */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-red-700 uppercase tracking-wide">
                        Sell Pressure
                      </span>
                      <span className="text-3xl font-bold text-red-600">
                        {(orderFlow.sell_pressure * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden shadow-inner">
                      <div
                        className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 h-full transition-all duration-500 rounded-full"
                        style={{ width: `${orderFlow.sell_pressure * 100}%` }}
                      ></div>
                    </div>
                  </div>
            
                  {/* Trend & Signal */}
                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-200">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Trend</p>
                      <p className="text-2xl font-bold flex items-center gap-2">
                        <span>{orderFlow.trend}</span>
                        <span className="text-3xl">{getTrendEmoji(orderFlow.trend)}</span>
                      </p>
                    </div>
                    <div className={`rounded-lg p-4 ${getSignalColor(orderFlow.signal)}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Signal</p>
                      <p className="text-2xl font-bold flex items-center gap-2">
                        <span>{orderFlow.signal}</span>
                        <span className="text-3xl">{getSignalEmoji(orderFlow.signal)}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Market Depth */}
                {marketDepth && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-6">
                      📈 Market Depth
                    </h2>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                        <p className="text-xs text-green-700 uppercase tracking-wide mb-2">Total Bid Qty</p>
                        <p className="text-2xl font-bold text-green-900">
                          {marketDepth.total_bid_qty.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                        <p className="text-xs text-red-700 uppercase tracking-wide mb-2">Total Ask Qty</p>
                        <p className="text-2xl font-bold text-red-900">
                          {marketDepth.total_ask_qty.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      {/* Top Bids */}
                      <div>
                        <p className="text-sm font-bold text-green-700 mb-3 uppercase tracking-wide border-b-2 border-green-500 pb-2">
                          Top 5 Bids
                        </p>
                        <div className="space-y-2">
                          {marketDepth.bids.slice(0, 5).map((bid, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                              <span className="text-green-700 font-semibold text-sm">
                                ₨{bid.price.toFixed(2)}
                              </span>
                              <span className="text-gray-800 font-medium text-sm">
                                {bid.qty.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top Asks */}
                      <div>
                        <p className="text-sm font-bold text-red-700 mb-3 uppercase tracking-wide border-b-2 border-red-500 pb-2">
                          Top 5 Asks
                        </p>
                        <div className="space-y-2">
                          {marketDepth.asks.slice(0, 5).map((ask, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                              <span className="text-red-700 font-semibold text-sm">
                                ₨{ask.price.toFixed(2)}
                              </span>
                              <span className="text-gray-800 font-medium text-sm">
                                {ask.qty.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Advanced Analytics */}
            {orderFlow && (orderFlow.large_orders || orderFlow.liquidity_walls) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Advanced Analytics
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Large Orders */}
                  {orderFlow.large_orders && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        🎯 Large Orders Detected
                      </h3>
                      {orderFlow.large_orders.large_bids?.length > 0 ? (
                        <div className="space-y-2">
                          {orderFlow.large_orders.large_bids.map((order: any, idx: number) => (
                            <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <p className="text-sm text-green-900">
                                <span className="font-semibold">Bid:</span> {order.qty.toLocaleString()} shares @ ₨{order.price}
                              </p>
                              <p className="text-xs text-green-700 mt-1">
                                {order.size_ratio}x average size
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No large bid orders detected</p>
                      )}

                      {orderFlow.large_orders.large_asks?.length > 0 && (
                        <div className="space-y-2 mt-3">
                          {orderFlow.large_orders.large_asks.map((order: any, idx: number) => (
                            <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <p className="text-sm text-red-900">
                                <span className="font-semibold">Ask:</span> {order.qty.toLocaleString()} shares @ ₨{order.price}
                              </p>
                              <p className="text-xs text-red-700 mt-1">
                                {order.size_ratio}x average size
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Liquidity Walls */}
                  {orderFlow.liquidity_walls && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        🧱 Liquidity Walls
                      </h3>
                      {orderFlow.liquidity_walls.bid_wall ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                          <p className="text-sm text-blue-900">
                            <span className="font-semibold">Support Wall:</span>
                          </p>
                          <p className="text-lg font-bold text-blue-700 mt-1">
                            {orderFlow.liquidity_walls.bid_wall.qty.toLocaleString()} shares @ ₨{orderFlow.liquidity_walls.bid_wall.price}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            Strength: {orderFlow.liquidity_walls.bid_wall.strength}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mb-2">No support wall detected</p>
                      )}

                      {orderFlow.liquidity_walls.ask_wall ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                          <p className="text-sm text-orange-900">
                            <span className="font-semibold">Resistance Wall:</span>
                          </p>
                          <p className="text-lg font-bold text-orange-700 mt-1">
                            {orderFlow.liquidity_walls.ask_wall.qty.toLocaleString()} shares @ ₨{orderFlow.liquidity_walls.ask_wall.price}
                          </p>
                          <p className="text-xs text-orange-600 mt-1">
                            Strength: {orderFlow.liquidity_walls.ask_wall.strength}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No resistance wall detected</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary Card */}
            {orderFlow && (
              <div className="mt-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                <h2 className="text-xl font-bold mb-4">📈 Trading Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-blue-100 mb-1">Symbol</p>
                    <p className="text-2xl font-bold">{orderFlow.symbol}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-100 mb-1">Imbalance</p>
                    <p className="text-2xl font-bold">{(orderFlow.imbalance * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-100 mb-1">Trend</p>
                    <p className="text-2xl font-bold flex items-center gap-2">
                      {orderFlow.trend} {getTrendEmoji(orderFlow.trend)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-100 mb-1">Action</p>
                    <p className="text-2xl font-bold flex items-center gap-2">
                      {orderFlow.signal} {getSignalEmoji(orderFlow.signal)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
