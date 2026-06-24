"use client";

import { useState, useEffect } from "react";

type MarketDepth = {
  symbol: string;
  timestamp: string;
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
  total_bid_qty: number;
  total_ask_qty: number;
};

export default function Home() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("NABIL");
  const [marketDepth, setMarketDepth] = useState<MarketDepth | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  // Fetch symbols
  useEffect(() => {
    fetch("/api/symbols")
      .then((res) => res.json())
      .then((data) => {
        setSymbols(data.symbols.map((s: any) => s.symbol));
      })
      .catch((err) => console.error("Error fetching symbols:", err));
  }, []);

  // Fetch market depth
  const fetchMarketDepth = async () => {
    if (!selectedSymbol) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/depth/${selectedSymbol}`);
      const data = await res.json();
      setMarketDepth(data);
    } catch (err) {
      console.error("Error fetching market depth:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMarketDepth();
  }, [selectedSymbol]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchMarketDepth, 5000); // 5 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, selectedSymbol]);

  // WebSocket connection
  useEffect(() => {
    if (!selectedSymbol) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/depth/${selectedSymbol}`);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "update") {
        setMarketDepth(data.data);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [selectedSymbol]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">NEPSE Market Depth</h1>
              <p className="text-sm text-gray-500">Real-time Order Book Data</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`}></div>
                <span className="text-sm text-gray-600">{wsConnected ? "Live" : "Disconnected"}</span>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Auto Refresh</span>
              </label>
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
            className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>

        {/* Loading State */}
        {loading && !marketDepth && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading market depth...</p>
          </div>
        )}

        {/* Market Depth Display */}
        {marketDepth && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bids */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                <h2 className="text-lg font-semibold text-green-900">
                  Bids ({marketDepth.bids.length})
                </h2>
                <p className="text-sm text-green-700">
                  Total: {marketDepth.total_bid_qty.toLocaleString()} shares
                </p>
              </div>
              <div className="overflow-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Price
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Quantity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {marketDepth.bids.map((bid, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-green-600">
                          ₨{bid.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {bid.qty.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Asks */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                <h2 className="text-lg font-semibold text-red-900">
                  Asks ({marketDepth.asks.length})
                </h2>
                <p className="text-sm text-red-700">
                  Total: {marketDepth.total_ask_qty.toLocaleString()} shares
                </p>
              </div>
              <div className="overflow-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Price
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Quantity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {marketDepth.asks.map((ask, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-red-600">
                          ₨{ask.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {ask.qty.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {marketDepth && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Best Bid</p>
                <p className="text-xl font-bold text-green-600">
                  ₨{marketDepth.bids[0]?.price.toFixed(2) || "0.00"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Best Ask</p>
                <p className="text-xl font-bold text-red-600">
                  ₨{marketDepth.asks[0]?.price.toFixed(2) || "0.00"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Spread</p>
                <p className="text-xl font-bold text-gray-900">
                  ₨{((marketDepth.asks[0]?.price || 0) - (marketDepth.bids[0]?.price || 0)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Updated</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(marketDepth.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No Data State */}
        {!loading && !marketDepth && (
          <div className="text-center py-12">
            <p className="text-gray-500">No market depth data available</p>
          </div>
        )}
      </main>
    </div>
  );
}
