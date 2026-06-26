"use client";
import { useEffect, useState } from "react";

interface BrokerStock {
  symbol: string;
  buyAmount: number;
  sellAmount: number;
  buyQty: number;
  sellQty: number;
  netAmount: number;
}

interface ChartProps {
  brokerCode: string;
  brokerName: string;
  stocks: BrokerStock[];
  date: string;
}

/**
 * Professional bar chart component matching ShareHubNepal design
 * Loads all data at once, no streaming or progressive loading
 */
export function BrokerAnalysisChart({ brokerCode, brokerName, stocks, date }: ChartProps) {
  const [displayStocks, setDisplayStocks] = useState<BrokerStock[]>([]);
  const [sortBy, setSortBy] = useState<"buyAmount" | "sellAmount" | "netAmount">("netAmount");

  // Sort stocks once when data loads
  useEffect(() => {
    if (!stocks || stocks.length === 0) {
      setDisplayStocks([]);
      return;
    }

    // Sort by selected metric
    const sorted = [...stocks].sort((a, b) => {
      switch (sortBy) {
        case "buyAmount":
          return b.buyAmount - a.buyAmount;
        case "sellAmount":
          return b.sellAmount - a.sellAmount;
        case "netAmount":
        default:
          return b.netAmount - a.netAmount;
      }
    });

    // Take top 10 for chart
    setDisplayStocks(sorted.slice(0, 10));
  }, [stocks, sortBy]);

  if (!stocks || stocks.length === 0) {
    return (
      <div className="p-6 text-center text-muted">
        <p className="text-sm">No stock data available</p>
      </div>
    );
  }

  // Calculate chart dimensions
  const maxValue = Math.max(
    ...displayStocks.map((s) => Math.max(s.buyAmount, s.sellAmount)),
    1
  );

  const chartWidth = 800;
  const chartHeight = 300;
  const barWidth = 30;
  const spacing = 70;

  // Calculate totals
  const totals = {
    buyAmount: stocks.reduce((sum, s) => sum + s.buyAmount, 0),
    sellAmount: stocks.reduce((sum, s) => sum + s.sellAmount, 0),
    netAmount: stocks.reduce((sum, s) => sum + s.netAmount, 0),
    buyTrans: stocks.filter((s) => s.buyAmount > 0).length,
    sellTrans: stocks.filter((s) => s.sellAmount > 0).length,
    matchingAmount: Math.min(
      stocks.reduce((sum, s) => sum + s.buyAmount, 0),
      stocks.reduce((sum, s) => sum + s.sellAmount, 0)
    ),
    matchingQty: stocks.reduce((sum, s) => sum + Math.min(s.buyQty, s.sellQty), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="text-xs text-muted">Broker Code: {brokerCode}</div>
          <div className="text-xl font-bold text-foreground">{brokerName}</div>
          <div className="text-xs text-muted mt-1">{date}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground">Total Stocks</div>
          <div className="text-2xl font-bold text-primary">{stocks.length}</div>
        </div>
      </div>

      {/* Sort Options */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted">Sort by:</span>
        {(["buyAmount", "sellAmount", "netAmount"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setSortBy(option)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
              sortBy === option
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground border border-border"
            }`}
          >
            {option === "buyAmount"
              ? "Buy Amount"
              : option === "sellAmount"
              ? "Sell Amount"
              : "Net Flow"}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="mb-4"
          style={{ minHeight: `${chartHeight}px` }}
        >
          {/* Grid lines */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={`grid-${i}`}>
              <line
                x1="80"
                y1={50 + (chartHeight - 100) * (1 - i / 5)}
                x2={chartWidth - 20}
                y2={50 + (chartHeight - 100) * (1 - i / 5)}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4"
              />
              <text
                x="70"
                y={55 + (chartHeight - 100) * (1 - i / 5)}
                textAnchor="end"
                fontSize="11"
                fill="#999"
              >
                {formatValue((maxValue * i) / 5)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {displayStocks.map((stock, idx) => {
            const baseY = chartHeight - 50;
            const scale = (chartHeight - 100) / maxValue;
            const buyHeight = stock.buyAmount * scale;
            const sellHeight = stock.sellAmount * scale;
            const x = 80 + idx * spacing;

            return (
              <g key={stock.symbol}>
                {/* Buy bar (green) */}
                <rect
                  x={x}
                  y={baseY - buyHeight}
                  width={barWidth / 2 - 1}
                  height={buyHeight}
                  fill="#22c55e"
                  rx="2"
                  className="hover:opacity-80 transition">
                  <title>{`${stock.symbol} Buy: ${formatValue(stock.buyAmount)}`}</title>
                </rect>

                {/* Sell bar (red) */}
                <rect
                  x={x + barWidth / 2 + 1}
                  y={baseY - sellHeight}
                  width={barWidth / 2 - 1}
                  height={sellHeight}
                  fill="#ef4444"
                  rx="2"
                  className="hover:opacity-80 transition">
                  <title>{`${stock.symbol} Sell: ${formatValue(stock.sellAmount)}`}</title>
                </rect>

                {/* Label */}
                <text
                  x={x + barWidth / 2}
                  y={baseY + 20}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="bold"
                  fill="#333"
                >
                  {stock.symbol}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1="80" y1="50" x2="80" y2={chartHeight - 50} stroke="#333" strokeWidth="2" />
          <line x1="80" y1={chartHeight - 50} x2={chartWidth - 20} y2={chartHeight - 50} stroke="#333" strokeWidth="2" />

          {/* Legend */}
          <rect x={chartWidth - 150} y="10" width="140" height="40" fill="white" stroke="#ddd" rx="4" />
          <rect x={chartWidth - 140} y="15" width="12" height="12" fill="#22c55e" />
          <text x={chartWidth - 125} y="24" fontSize="11" fill="#333" fontWeight="bold">
            Buy
          </text>
          <rect x={chartWidth - 140} y="30" width="12" height="12" fill="#ef4444" />
          <text x={chartWidth - 125} y="39" fontSize="11" fill="#333" fontWeight="bold">
            Sell
          </text>
        </svg>
      </div>

      {/* Stats Cards */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Trading Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Buy Amount" value={formatValue(totals.buyAmount)} color="text-green-600" />
          <StatCard label="Total Sell Amount" value={formatValue(totals.sellAmount)} color="text-red-600" />
          <StatCard label="Net Amount" value={formatValue(totals.netAmount)} color={totals.netAmount >= 0 ? "text-green-600" : "text-red-600"} />
          <StatCard label="Buy Transactions" value={totals.buyTrans.toString()} />
          <StatCard label="Sell Transactions" value={totals.sellTrans.toString()} />
          <StatCard label="Matching Amount" value={formatValue(totals.matchingAmount)} />
        </div>
      </div>

      {/* Stock Details Table */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Top 10 Stocks by {sortBy === "buyAmount" ? "Buy Amount" : sortBy === "sellAmount" ? "Sell Amount" : "Net Flow"}</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Symbol</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Buy Amount</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Sell Amount</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Net Amount</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Buy Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Sell Qty</th>
                </tr>
              </thead>
              <tbody>
                {displayStocks.map((stock, idx) => (
                  <tr key={stock.symbol} className={`${idx % 2 === 0 ? "bg-surface" : "bg-surface-2"} hover:bg-primary/5 border-b border-border transition`}>
                    <td className="px-3 py-2 text-sm font-semibold text-foreground">{stock.symbol}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-green-600">{formatValue(stock.buyAmount)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-red-600">{formatValue(stock.sellAmount)}</td>
                    <td className={`px-3 py-2 text-right text-xs font-semibold ${stock.netAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {stock.netAmount >= 0 ? "+" : ""}{formatValue(stock.netAmount)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted">{stock.buyQty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted">{stock.sellQty.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

// Format value function
function formatValue(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}
