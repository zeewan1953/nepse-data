"use client";
import { useState, useEffect } from "react";

interface BrokerStock {
  symbol: string;
  buyAmt: number;
  sellAmt: number;
  buyQty: number;
  sellQty: number;
  netAmt: number;
}

interface BrokerStocksGridProps {
  brokerCode: string;
  brokerName: string;
  maxDisplay?: number;
}

export function BrokerStocksGrid({ brokerCode, brokerName, maxDisplay = 25 }: BrokerStocksGridProps) {
  const [stocks, setStocks] = useState<BrokerStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchBrokerStocks();
  }, [brokerCode]);

  const fetchBrokerStocks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/broker/${brokerCode}`);

      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        setStocks([]);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!data.stocks || !Array.isArray(data.stocks)) {
        console.warn(`No stocks data in response for broker ${brokerCode}`, data);
        setStocks([]);
        setLoading(false);
        return;
      }

      // Map the response format to our interface
      const mappedStocks = data.stocks.map((stock: any) => ({
        symbol: stock.symbol || stock.name || 'UNKNOWN',
        buyAmt: Number(stock.buyAmt) || 0,
        sellAmt: Number(stock.sellAmt) || 0,
        buyQty: Number(stock.buyQty) || 0,
        sellQty: Number(stock.sellQty) || 0,
        netAmt: (Number(stock.netAmt) || Number(stock.buyAmt || 0) - Number(stock.sellAmt || 0)) || 0,
      }));

      setStocks(mappedStocks);
    } catch (error) {
      console.error(`Failed to fetch stocks for broker ${brokerCode}:`, error);
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  const displayStocks = expanded ? stocks : stocks.slice(0, maxDisplay);
  const hasMore = stocks.length > maxDisplay;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-2 text-xs text-muted">Loading stocks...</span>
      </div>
    );
  }

  if (!stocks.length) {
    // Show sample data for common brokers if API fails
    const sampleStocksByBroker: Record<string, BrokerStock[]> = {
      "58": [
        { symbol: "NRN", buyAmt: 2500000000, sellAmt: 1200000000, buyQty: 45200, sellQty: 28300, netAmt: 1300000000 },
        { symbol: "BUNGAL", buyAmt: 3200000000, sellAmt: 900000000, buyQty: 52100, sellQty: 18900, netAmt: 2300000000 },
        { symbol: "RSML", buyAmt: 1800000000, sellAmt: 2100000000, buyQty: 28500, sellQty: 31200, netAmt: -300000000 },
      ],
      "65": [
        { symbol: "NRN", buyAmt: 1500000000, sellAmt: 800000000, buyQty: 28500, sellQty: 15200, netAmt: 700000000 },
        { symbol: "BUNGAL", buyAmt: 2100000000, sellAmt: 650000000, buyQty: 35800, sellQty: 12500, netAmt: 1450000000 },
        { symbol: "KHPL", buyAmt: 1200000000, sellAmt: 950000000, buyQty: 18900, sellQty: 14200, netAmt: 250000000 },
      ],
      "32": [
        { symbol: "RSML", buyAmt: 2300000000, sellAmt: 1800000000, buyQty: 38500, sellQty: 29800, netAmt: 500000000 },
        { symbol: "HEIP", buyAmt: 1600000000, sellAmt: 1200000000, buyQty: 42100, sellQty: 31500, netAmt: 400000000 },
        { symbol: "NRN", buyAmt: 1900000000, sellAmt: 1500000000, buyQty: 35200, sellQty: 28100, netAmt: 400000000 },
      ],
    };

    const fallbackStocks = sampleStocksByBroker[brokerCode];
    if (fallbackStocks && fallbackStocks.length > 0) {
      return (
        <div className="space-y-3">
          {/* Grid Display (5 columns) */}
          <div className="grid grid-cols-5 gap-2">
            {fallbackStocks.map((stock) => (
              <div
                key={stock.symbol}
                className="rounded border border-border bg-surface-2 p-2 hover:bg-primary/5 transition opacity-60"
              >
                {/* Symbol */}
                <div className="text-xs font-bold text-foreground mb-1 truncate">
                  {stock.symbol}
                </div>

                {/* Buy/Sell Amounts */}
                <div className="space-y-1 text-xs">
                  {stock.buyAmt > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Buy:</span>
                      <span className="font-semibold text-green-600">
                        {formatCompactAmount(stock.buyAmt)}
                      </span>
                    </div>
                  )}

                  {stock.sellAmt > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Sell:</span>
                      <span className="font-semibold text-red-600">
                        {formatCompactAmount(stock.sellAmt)}
                      </span>
                    </div>
                  )}

                  {stock.netAmt !== 0 && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span className="text-muted">Net:</span>
                      <span className={`font-semibold text-xs ${stock.netAmt > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.netAmt > 0 ? '+' : ''}{formatCompactAmount(stock.netAmt)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quantities */}
                {(stock.buyQty > 0 || stock.sellQty > 0) && (
                  <div className="text-xs text-muted mt-2 pt-2 border-t border-border/50">
                    {stock.buyQty > 0 && <div>B: {formatCompactVolume(stock.buyQty)}</div>}
                    {stock.sellQty > 0 && <div>S: {formatCompactVolume(stock.sellQty)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border text-xs text-muted italic">
            (Sample data - API unavailable)
          </div>
        </div>
      );
    }

    return (
      <div className="py-4 text-center">
        <p className="text-xs text-muted">No stock data available for this broker</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Grid Display (5 columns) */}
      <div className="grid grid-cols-5 gap-2">
        {displayStocks.map((stock) => (
          <div
            key={stock.symbol}
            className="rounded border border-border bg-surface-2 p-2 hover:bg-primary/5 transition"
          >
            {/* Symbol */}
            <div className="text-xs font-bold text-foreground mb-1 truncate">
              {stock.symbol}
            </div>

            {/* Buy/Sell Amounts */}
            <div className="space-y-1 text-xs">
              {/* Buy */}
              {stock.buyAmt > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Buy:</span>
                  <span className="font-semibold text-green-600">
                    {formatCompactAmount(stock.buyAmt)}
                  </span>
                </div>
              )}

              {/* Sell */}
              {stock.sellAmt > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Sell:</span>
                  <span className="font-semibold text-red-600">
                    {formatCompactAmount(stock.sellAmt)}
                  </span>
                </div>
              )}

              {/* Net */}
              {stock.netAmt !== 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-muted">Net:</span>
                  <span className={`font-semibold text-xs ${stock.netAmt > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stock.netAmt > 0 ? '+' : ''}{formatCompactAmount(stock.netAmt)}
                  </span>
                </div>
              )}
            </div>

            {/* Quantities (if available) */}
            {(stock.buyQty > 0 || stock.sellQty > 0) && (
              <div className="text-xs text-muted mt-2 pt-2 border-t border-border/50">
                {stock.buyQty > 0 && <div>B: {formatCompactVolume(stock.buyQty)}</div>}
                {stock.sellQty > 0 && <div>S: {formatCompactVolume(stock.sellQty)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expand/Collapse Button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-1 text-xs font-semibold text-primary hover:text-primary/80 border border-primary rounded transition"
          >
            {expanded ? `Show Less (${maxDisplay} of ${stocks.length})` : `Show All (${stocks.length} stocks)`}
          </button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="pt-2 border-t border-border text-xs text-muted">
        <div className="flex justify-between">
          <span>Total Stocks: {stocks.length}</span>
          <span>
            Buy Stocks: {stocks.filter((s) => s.buyAmt > 0).length} | Sell Stocks: {stocks.filter((s) => s.sellAmt > 0).length}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatCompactAmount(amount: number): string {
  if (amount === 0) return "0";
  const abs = Math.abs(amount);
  if (abs >= 1e7) {
    return `${(amount / 1e7).toFixed(2)}Cr`;
  }
  if (abs >= 1e5) {
    return `${(amount / 1e5).toFixed(2)}L`;
  }
  if (abs >= 1e3) {
    return `${(amount / 1e3).toFixed(1)}K`;
  }
  return amount.toString();
}

function formatCompactVolume(volume: number): string {
  if (volume === 0) return "0";
  if (volume >= 1e6) {
    return `${(volume / 1e6).toFixed(1)}M`;
  }
  if (volume >= 1e3) {
    return `${(volume / 1e3).toFixed(0)}K`;
  }
  return volume.toString();
}
