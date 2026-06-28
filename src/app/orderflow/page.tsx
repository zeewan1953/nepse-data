"use client";
import { useState, useEffect } from "react";
import { getMarketSession } from "@/lib/market-hours";

type OrderFlowData = {
  buy_pressure: number | null;
  sell_pressure: number | null;
  imbalance: number | null;
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS" | null;
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | null;
  large_orders: Array<{ price: number; qty: number; type: "buy" | "sell" }>;
  liquidity_walls: Array<{ price: number; qty: number; type: "support" | "resistance" }>;
  ltp: number;
  total_buy_qty: number | null;
  total_sell_qty: number | null;
  total_trades: number;
  unavailable?: boolean;
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

function getTrendEmoji(trend: string | null) {
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
        // Auto-load ADBL on first load
        const adbl = stockList.find((s: StockInfo) => s.symbol === "ADBL");
        if (adbl && !selectedSymbol) fetchOrderFlow("ADBL", adbl);
      }
    } catch (e) {
      console.error("Failed to fetch stocks:", e);
    }
  };

  // Search/filter stocks
  const filteredStocks = searchQuery.trim()
    ? stocks.filter((s) => s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : stocks;

  // Fetch order flow for selected symbol
  const fetchOrderFlow = async (symbol: string, stockInfoOverride?: StockInfo) => {
    if (!symbol) return;
    
    setLoading(true);
    setSelectedSymbol(symbol);
    setSearchQuery("");
    
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
      
      const stockInfo = stockInfoOverride ?? stocks.find((s) => s.symbol === symbol);
      if (!stockInfo) {
        console.error('[OrderFlow] Stock not found:', symbol);
        setLoading(false);
        return;
      }
      
      // Process floorsheet
      const trades = floorsheetData?.floorsheets?.content || floorsheetData?.content || [];
      console.log('[OrderFlow] Processing trades:', trades.length, 'for', symbol);
      
      const total_trades = trades.length;

      // Guard: no tick data → unavailable
      if (total_trades === 0) {
        setOrderFlow({
          buy_pressure: null,
          sell_pressure: null,
          imbalance: null,
          trend: null,
          signal: null,
          large_orders: [],
          liquidity_walls: [],
          ltp: stockInfo.ltp,
          total_buy_qty: null,
          total_sell_qty: null,
          total_trades: 0,
          unavailable: true,
        });
        setLoading(false);
        return;
      }

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
        total_trades,
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
      </div>

      <div className="flex gap-3">
        {/* ── Left: Stock Table ── */}
        <div className="w-[220px] shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search..."
            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[11px] mb-2 focus:border-primary focus:outline-none"
          />
          <div className="bg-white rounded-lg border border-gray-200 max-h-[calc(100vh-140px)] overflow-y-auto">
            {filteredStocks.length === 0 ? (
              <p className="text-[10px] text-gray-400 py-4 text-center">No stocks match</p>
            ) : filteredStocks.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => fetchOrderFlow(stock.symbol)}
                className={`w-full px-2 py-1.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition flex items-center justify-between ${
                  selectedSymbol === stock.symbol ? "bg-sky-50 border-l-2 border-l-sky-500" : ""
                }`}
              >
                <span className="text-[11px] font-bold text-gray-800">{stock.symbol}</span>
                <span className={`text-[10px] font-semibold tabular-nums ${stock.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Selected Stock Content ── */}
        <div className="flex-1 min-w-0">
          {!mounted ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-500">Loading...</div>
            </div>
          ) : !selectedSymbol ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <div className="text-5xl mb-3">📊</div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Select a Stock</h2>
              <p className="text-xs text-gray-500">Click a stock from the left panel</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-500">Loading {selectedSymbol} data...</div>
            </div>
          ) : orderFlow && currentStock ? (
            <div className="space-y-3">
              {/* Stock Info */}
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">{currentStock.symbol}</h2>
                    <span className="text-[9px] text-gray-500">{currentStock.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900">₨{currentStock.ltp.toFixed(2)}</span>
                    <span className={`ml-1.5 text-[10px] font-bold ${currentStock.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {currentStock.change >= 0 ? "+" : ""}{currentStock.change.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-sky-100 text-[10px] text-gray-600">
                  <span>H: ₨{currentStock.high.toFixed(2)}</span>
                  <span>L: ₨{currentStock.low.toFixed(2)}</span>
                  <span>C: ₨{currentStock.close.toFixed(2)}</span>
                  <span className="ml-auto text-gray-500">Vol: {currentStock.volume.toLocaleString()}</span>
                </div>
              </div>

              {/* Order Flow + Market Depth merged */}
              <div className="space-y-3">
                {/* Order Flow */}
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-bold text-gray-900">📊 Order Flow</h2>
                    <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-200">
                      Estimated
                    </span>
                  </div>

                  {orderFlow.unavailable ? (
                    <>
                      <p className="text-[10px] text-gray-400 mb-2">
                        No tick-level data for this session
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-gray-50 rounded p-2 border border-gray-100">
                          <p className="text-[9px] text-gray-400 uppercase mb-0.5">Buy</p>
                          <p className="text-sm font-bold text-gray-300">—%</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-1" />
                          <p className="text-[9px] text-gray-300 mt-0.5">Qty: —</p>
                        </div>
                        <div className="bg-gray-50 rounded p-2 border border-gray-100">
                          <p className="text-[9px] text-gray-400 uppercase mb-0.5">Sell</p>
                          <p className="text-sm font-bold text-gray-300">—%</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-1" />
                          <p className="text-[9px] text-gray-300 mt-0.5">Qty: —</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="border border-gray-200 rounded px-1.5 py-0.5 font-semibold text-gray-400">NO DATA</span>
                        <span className="border border-gray-200 rounded px-1.5 py-0.5 font-semibold text-gray-400">UNAVAILABLE</span>
                        <span className="ml-auto font-semibold text-gray-500">{orderFlow.total_trades}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-green-50 rounded p-2 border border-green-100">
                          <p className="text-[9px] text-green-600 uppercase mb-0.5">Buy</p>
                          <p className="text-sm font-bold text-green-700">{(orderFlow.buy_pressure! * 100).toFixed(0)}%</p>
                          <div className="w-full bg-green-100 rounded-full h-2 mt-1">
                            <div className="bg-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${orderFlow.buy_pressure! * 100}%` }} />
                          </div>
                          <p className="text-[9px] text-green-500 mt-0.5">{orderFlow.total_buy_qty!.toLocaleString()}</p>
                        </div>
                        <div className="bg-red-50 rounded p-2 border border-red-100">
                          <p className="text-[9px] text-red-600 uppercase mb-0.5">Sell</p>
                          <p className="text-sm font-bold text-red-700">{(orderFlow.sell_pressure! * 100).toFixed(0)}%</p>
                          <div className="w-full bg-red-100 rounded-full h-2 mt-1">
                            <div className="bg-red-500 h-full rounded-full transition-all duration-500" style={{ width: `${orderFlow.sell_pressure! * 100}%` }} />
                          </div>
                          <p className="text-[9px] text-red-500 mt-0.5">{orderFlow.total_sell_qty!.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-semibold">{orderFlow.trend} {getTrendEmoji(orderFlow.trend)}</span>
                        <span className={`rounded px-1.5 py-0.5 font-bold border ${getSignalColor(orderFlow.signal!)} text-[9px]`}>
                          {orderFlow.signal} {getSignalEmoji(orderFlow.signal!)}
                        </span>
                        <span className="ml-auto text-gray-400">
                          <span className="text-gray-500">Imb:</span> {(orderFlow.imbalance! * 100).toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Market Depth */}
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-bold text-gray-900">📈 Market Depth</h2>
                    {marketDepth ? (
                      <span className="text-[9px] text-gray-400">{marketDepth.bids.length + marketDepth.asks.length} levels</span>
                    ) : isMarketOpen ? (
                      <span className="flex items-center gap-1 text-[9px] text-amber-500">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                        </span>
                        Retrying
                      </span>
                    ) : null}
                  </div>
                  {marketDepth ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-green-50 rounded p-2 border border-green-100">
                          <p className="text-[9px] text-green-600 uppercase">Total Bid</p>
                          <p className="text-sm font-bold text-green-800">{marketDepth.total_bid_qty.toLocaleString()}</p>
                        </div>
                        <div className="bg-red-50 rounded p-2 border border-red-100">
                          <p className="text-[9px] text-red-600 uppercase">Total Ask</p>
                          <p className="text-sm font-bold text-red-800">{marketDepth.total_ask_qty.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[9px] font-bold text-green-700 mb-1 uppercase border-b border-green-300 pb-0.5">Bids</p>
                          <div className="space-y-1">
                            {marketDepth.bids.length > 0 ? marketDepth.bids.map((bid, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-green-50 rounded px-1.5 py-1 border border-green-100">
                                <span className="text-green-700 font-semibold text-[10px]">₨{bid.price.toFixed(2)}</span>
                                <span className="text-gray-700 font-medium text-[10px]">{bid.qty.toLocaleString()}</span>
                              </div>
                            )) : (
                              <p className="text-[10px] text-gray-400 py-2 text-center">No data</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-red-700 mb-1 uppercase border-b border-red-300 pb-0.5">Asks</p>
                          <div className="space-y-1">
                            {marketDepth.asks.length > 0 ? marketDepth.asks.map((ask, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-red-50 rounded px-1.5 py-1 border border-red-100">
                                <span className="text-red-700 font-semibold text-[10px]">₨{ask.price.toFixed(2)}</span>
                                <span className="text-gray-700 font-medium text-[10px]">{ask.qty.toLocaleString()}</span>
                              </div>
                            )) : (
                              <p className="text-[10px] text-gray-400 py-2 text-center">No data</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center min-h-[80px]">
                      <p className="text-[10px] text-gray-400">
                        {isMarketOpen ? "Market depth not available — retrying every 10s" : "Market depth not available"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Analytics */}
              {(orderFlow.large_orders.length > 0 || orderFlow.liquidity_walls.length > 0) && (
                <div className="space-y-3">
                  {orderFlow.large_orders.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                      <h2 className="text-[10px] font-bold text-gray-900 uppercase mb-2">🎯 Large Orders &gt;5K</h2>
                      <div className="space-y-1">
                        {orderFlow.large_orders.slice(0, 5).map((order, idx) => (
                          <div key={idx} className="flex justify-between items-center rounded px-2 py-1.5 bg-green-50 border border-green-100">
                            <span className="text-[10px] font-semibold text-gray-700">₨{order.price.toFixed(2)}</span>
                            <span className="text-[10px] font-bold text-green-600">{order.qty.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {orderFlow.liquidity_walls.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                      <h2 className="text-[10px] font-bold text-gray-900 uppercase mb-2"> Liquidity Walls &gt;10K</h2>
                      <div className="space-y-1">
                        {orderFlow.liquidity_walls.map((wall, idx) => (
                          <div key={idx} className={`flex justify-between items-center rounded px-2 py-1.5 border ${
                            wall.type === "support" ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"
                          }`}>
                            <span className="text-[10px] font-semibold text-gray-700">₨{wall.price.toFixed(2)}</span>
                            <span className="text-[10px] font-bold">{wall.qty.toLocaleString()}</span>
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
      </div>
    </div>
  );
}
