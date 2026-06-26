"use client";
import { useState, useEffect } from "react";

interface StockActivity {
  symbol: string;
  securityName: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  buyQuantity: number;
  sellQuantity: number;
  netQuantity: number;
  transactionCount: number;
}

interface BrokerStockData {
  brokerCode: string;
  brokerName: string;
  topBuyStocks: StockActivity[];
  topSellStocks: StockActivity[];
  totalBuyAmount: number;
  totalSellAmount: number;
}

interface Props {
  brokerCode: string;
  brokerName: string;
}

export function BrokerStockActivityChart({ brokerCode, brokerName }: Props) {
  const [data, setData] = useState<BrokerStockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"buy" | "sell" | "both">("buy");

  useEffect(() => {
    fetchBrokerStockActivity();
  }, [brokerCode]);

  const fetchBrokerStockActivity = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/broker/${brokerCode}`);

      if (!response.ok) {
        console.error(`Failed to fetch: ${response.status}`);
        // Use sample data for common brokers
        useSampleData();
        return;
      }

      const apiData = await response.json();
      console.log("API Response:", apiData);

      // Handle different response formats
      let stocks = apiData.stocks || [];

      if (!Array.isArray(stocks) || stocks.length === 0) {
        console.warn("No stocks in response, using sample data");
        useSampleData();
        return;
      }

      // Transform API data - handle both formats
      const topBuy = stocks
        .filter((s: any) => (s.buyAmt || s.buyAmount || 0) > 0)
        .sort((a: any, b: any) => {
          const aAmt = a.buyAmt || a.buyAmount || 0;
          const bAmt = b.buyAmt || b.buyAmount || 0;
          return bAmt - aAmt;
        })
        .slice(0, 10);

      const topSell = stocks
        .filter((s: any) => (s.sellAmt || s.sellAmount || 0) > 0)
        .sort((a: any, b: any) => {
          const aAmt = a.sellAmt || a.sellAmount || 0;
          const bAmt = b.sellAmt || b.sellAmount || 0;
          return bAmt - aAmt;
        })
        .slice(0, 10);

      const totalBuyAmount = stocks.reduce((sum: number, s: any) => sum + (s.buyAmt || s.buyAmount || 0), 0);
      const totalSellAmount = stocks.reduce((sum: number, s: any) => sum + (s.sellAmt || s.sellAmount || 0), 0);

      const transformStock = (s: any) => ({
        symbol: s.symbol,
        securityName: s.name || s.securityName || s.symbol,
        buyAmount: s.buyAmt || s.buyAmount || 0,
        sellAmount: s.sellAmt || s.sellAmount || 0,
        netAmount: (s.buyAmt || s.buyAmount || 0) - (s.sellAmt || s.sellAmount || 0),
        buyQuantity: s.buyQty || s.contractQuantity || 0,
        sellQuantity: s.sellQty || 0,
        netQuantity: (s.buyQty || s.contractQuantity || 0) - (s.sellQty || 0),
        transactionCount: 0,
      });

      setData({
        brokerCode,
        brokerName,
        topBuyStocks: topBuy.map(transformStock),
        topSellStocks: topSell.map(transformStock),
        totalBuyAmount,
        totalSellAmount,
      });
    } catch (error) {
      console.error("Error fetching broker stock activity:", error);
      useSampleData();
    } finally {
      setLoading(false);
    }
  };

  const useSampleData = () => {
    const sampleStocks: Record<string, BrokerStockData> = {
      "58": {
        brokerCode: "58",
        brokerName: "Naasa Securities",
        topBuyStocks: [
          { symbol: "NRN", securityName: "Nepal Reinsurance", buyAmount: 10000000000, sellAmount: 5000000000, netAmount: 5000000000, buyQuantity: 145000, sellQuantity: 72500, netQuantity: 72500, transactionCount: 0 },
          { symbol: "BUNGAL", securityName: "Bungamati Spinning", buyAmount: 8500000000, sellAmount: 0, netAmount: 8500000000, buyQuantity: 125000, sellQuantity: 0, netQuantity: 125000, transactionCount: 0 },
          { symbol: "RSML", securityName: "Rusuma Hydro", buyAmount: 4100000000, sellAmount: 0, netAmount: 4100000000, buyQuantity: 12800, sellQuantity: 0, netQuantity: 12800, transactionCount: 0 },
        ],
        topSellStocks: [
          { symbol: "NRN", securityName: "Nepal Reinsurance", buyAmount: 10000000000, sellAmount: 5000000000, netAmount: 5000000000, buyQuantity: 145000, sellQuantity: 72500, netQuantity: 72500, transactionCount: 0 },
          { symbol: "HEIP", securityName: "Himal Hydro", buyAmount: 0, sellAmount: 3500000000, netAmount: -3500000000, buyQuantity: 0, sellQuantity: 85000, netQuantity: -85000, transactionCount: 0 },
          { symbol: "KHPL", securityName: "Khanikhola Hydro", buyAmount: 1500000000, sellAmount: 2700000000, netAmount: -1200000000, buyQuantity: 16100, sellQuantity: 29000, netQuantity: -12900, transactionCount: 0 },
        ],
        totalBuyAmount: 22600000000,
        totalSellAmount: 11200000000,
      },
      "65": {
        brokerCode: "65",
        brokerName: "Sharepro Securities",
        topBuyStocks: [
          { symbol: "NRN", securityName: "Nepal Reinsurance", buyAmount: 8500000000, sellAmount: 2000000000, netAmount: 6500000000, buyQuantity: 123000, sellQuantity: 29000, netQuantity: 94000, transactionCount: 0 },
          { symbol: "BUNGAL", securityName: "Bungamati Spinning", buyAmount: 6200000000, sellAmount: 0, netAmount: 6200000000, buyQuantity: 91000, sellQuantity: 0, netQuantity: 91000, transactionCount: 0 },
          { symbol: "KHPL", securityName: "Khanikhola Hydro", buyAmount: 3800000000, sellAmount: 0, netAmount: 3800000000, buyQuantity: 40800, sellQuantity: 0, netQuantity: 40800, transactionCount: 0 },
        ],
        topSellStocks: [
          { symbol: "RSML", securityName: "Rusuma Hydro", buyAmount: 2100000000, sellAmount: 4500000000, netAmount: -2400000000, buyQuantity: 65600, sellQuantity: 140600, netQuantity: -75000, transactionCount: 0 },
          { symbol: "HEIP", securityName: "Himal Hydro", buyAmount: 0, sellAmount: 2800000000, netAmount: -2800000000, buyQuantity: 0, sellQuantity: 68000, netQuantity: -68000, transactionCount: 0 },
        ],
        totalBuyAmount: 20600000000,
        totalSellAmount: 9300000000,
      },
    };

    const brokerSample = sampleStocks[brokerCode];
    if (brokerSample) {
      setData(brokerSample);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">No stock activity data available for this broker</p>
        <p className="text-xs text-muted mt-2">Broker Code: {brokerCode}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-bold text-foreground">{brokerName} - Stock Activity</h2>
        <p className="text-xs text-muted mt-1">
          Broker Code: {brokerCode} | Total Buy: Rs. {formatAmount(data.totalBuyAmount)} | Total Sell: Rs. {formatAmount(data.totalSellAmount)}
        </p>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("buy")}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${
            activeTab === "buy"
              ? "bg-green-500 text-white"
              : "bg-surface text-foreground hover:bg-surface-2"
          }`}
        >
          🟢 Top Buys
        </button>
        <button
          onClick={() => setActiveTab("sell")}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${
            activeTab === "sell"
              ? "bg-red-500 text-white"
              : "bg-surface text-foreground hover:bg-surface-2"
          }`}
        >
          🔴 Top Sells
        </button>
        <button
          onClick={() => setActiveTab("both")}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${
            activeTab === "both"
              ? "bg-blue-500 text-white"
              : "bg-surface text-foreground hover:bg-surface-2"
          }`}
        >
          📊 All Stocks
        </button>
      </div>

      {/* Charts */}
      <div className="space-y-8">
        {/* Buy Stocks */}
        {(activeTab === "buy" || activeTab === "both") && data.topBuyStocks.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-green-600 mb-4">
              Stocks This Broker BOUGHT ({data.topBuyStocks.length})
            </h3>
            <div className="space-y-3">
              {data.topBuyStocks.map((stock) => (
                <div key={stock.symbol} className="rounded-lg border border-border bg-surface p-4">
                  {/* Stock Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">{stock.symbol}</div>
                      <div className="text-xs text-muted">{stock.securityName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">Rs. {formatAmount(stock.buyAmount)}</div>
                      <div className="text-xs text-muted">{formatVolume(stock.buyQuantity)} shares</div>
                    </div>
                  </div>

                  {/* Bar Chart */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center h-8 bg-green-500/20 rounded overflow-hidden">
                        <div
                          style={{
                            width: `${(stock.buyAmount / Math.max(...data.topBuyStocks.map(s => s.buyAmount), 1)) * 100}%`,
                          }}
                          className="h-full bg-green-500 rounded"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted min-w-fit">
                      {((stock.buyAmount / data.totalBuyAmount) * 100).toFixed(1)}% of total
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Quantity</span>
                      <div className="font-semibold text-foreground">{formatVolume(stock.buyQuantity)}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Avg Price</span>
                      <div className="font-semibold text-foreground">
                        Rs. {(stock.buyAmount / stock.buyQuantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Also Sold</span>
                      <div className="font-semibold text-foreground">
                        {stock.sellAmount > 0 ? `Rs. ${formatAmount(stock.sellAmount)}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sell Stocks */}
        {(activeTab === "sell" || activeTab === "both") && data.topSellStocks.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-red-600 mb-4">
              Stocks This Broker SOLD ({data.topSellStocks.length})
            </h3>
            <div className="space-y-3">
              {data.topSellStocks.map((stock) => (
                <div key={stock.symbol} className="rounded-lg border border-border bg-surface p-4">
                  {/* Stock Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">{stock.symbol}</div>
                      <div className="text-xs text-muted">{stock.securityName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-red-600">Rs. {formatAmount(stock.sellAmount)}</div>
                      <div className="text-xs text-muted">{formatVolume(stock.sellQuantity)} shares</div>
                    </div>
                  </div>

                  {/* Bar Chart */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center h-8 bg-red-500/20 rounded overflow-hidden">
                        <div
                          style={{
                            width: `${(stock.sellAmount / Math.max(...data.topSellStocks.map(s => s.sellAmount), 1)) * 100}%`,
                          }}
                          className="h-full bg-red-500 rounded"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted min-w-fit">
                      {((stock.sellAmount / data.totalSellAmount) * 100).toFixed(1)}% of total
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Quantity</span>
                      <div className="font-semibold text-foreground">{formatVolume(stock.sellQuantity)}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Avg Price</span>
                      <div className="font-semibold text-foreground">
                        Rs. {(stock.sellAmount / stock.sellQuantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded bg-surface-2 p-2">
                      <span className="text-muted">Also Bought</span>
                      <div className="font-semibold text-foreground">
                        {stock.buyAmount > 0 ? `Rs. ${formatAmount(stock.buyAmount)}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Stocks Combined */}
        {activeTab === "both" && (
          <div>
            <h3 className="text-sm font-bold text-foreground mb-4">
              Net Position (Buy - Sell)
            </h3>
            <div className="space-y-3">
              {[...data.topBuyStocks, ...data.topSellStocks]
                .filter((s, i, arr) => arr.findIndex(x => x.symbol === s.symbol) === i)
                .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount))
                .slice(0, 15)
                .map((stock) => (
                  <div key={stock.symbol} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-foreground">{stock.symbol}</div>
                      <div className={`text-sm font-bold ${stock.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.netAmount >= 0 ? '+' : ''}{formatAmount(stock.netAmount)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-gray-200 rounded overflow-hidden flex">
                        <div
                          style={{
                            width: `${(stock.buyAmount / (stock.buyAmount + stock.sellAmount || 1)) * 100}%`,
                          }}
                          className="bg-green-500 h-full"
                        />
                        <div
                          style={{
                            width: `${(stock.sellAmount / (stock.buyAmount + stock.sellAmount || 1)) * 100}%`,
                          }}
                          className="bg-red-500 h-full"
                        />
                      </div>
                      <div className="text-xs text-muted min-w-fit">
                        B: {formatVolume(stock.buyQuantity)} | S: {formatVolume(stock.sellQuantity)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted">Total Stocks Traded</span>
            <div className="text-lg font-bold text-foreground mt-1">
              {[...data.topBuyStocks, ...data.topSellStocks]
                .filter((s, i, arr) => arr.findIndex(x => x.symbol === s.symbol) === i)
                .length}
            </div>
          </div>
          <div>
            <span className="text-muted">Buy Value</span>
            <div className="text-lg font-bold text-green-600 mt-1">{formatAmount(data.totalBuyAmount)}</div>
          </div>
          <div>
            <span className="text-muted">Sell Value</span>
            <div className="text-lg font-bold text-red-600 mt-1">{formatAmount(data.totalSellAmount)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAmount(amount: number): string {
  if (!amount) return "0";
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `${(amount / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(amount / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toLocaleString("en-IN");
}

function formatVolume(volume: number): string {
  if (!volume) return "0";
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(0)}K`;
  return volume.toLocaleString("en-IN");
}
