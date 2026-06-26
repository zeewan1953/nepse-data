"use client";
import { useEffect, useState } from "react";

// Data source metadata (tracked in code but not shown to users)
type DataSource = "merolagani" | "nepalstock" | "nepsealpha" | "sharehubnepal" | "floorsheet";

interface StockData {
  stockSymbol: string;
  buyAmt: number;
  sellAmt: number;
  buyQty: number;
  sellQty: number;
  netAmt: number;
  source: DataSource;
  timestamp: string;
}

interface BrokerChartProps {
  brokerCode: string;
  brokerName: string;
  date: string;
}

// Advanced bar chart component (matches ShareHubNepal design)
export function AdvancedBrokerChart({ brokerCode, brokerName, date }: BrokerChartProps) {
  const [data, setData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"TopBuy" | "TopSell" | "TopNet">("TopBuy");
  const [sourceBreakdown, setSourceBreakdown] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchBrokerData();
  }, [brokerCode, date]);

  const fetchBrokerData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/broker-stocks?broker=${brokerCode}&date=${date}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result = await response.json();

      // Map API response to chart data, tracking sources in console only
      const stocks = (result.stocks || []).map((stock: any) => ({
        stockSymbol: stock.stockSymbol || stock.symbol,
        buyAmt: Number(stock.buyAmt) || 0,
        sellAmt: Number(stock.sellAmt) || 0,
        buyQty: Number(stock.buyQty) || 0,
        sellQty: Number(stock.sellQty) || 0,
        netAmt: Number(stock.netAmt) || 0,
        source: (result.source || "floorsheet") as DataSource,
        timestamp: new Date().toISOString(),
      }));

      // Log source info to console (developer visibility only)
      const sourceMeta = result.sourceBreakdown || { [result.source]: stocks.length };
      console.group("📊 Broker Analysis Data Sources");
      console.log(`Broker: ${brokerName} (${brokerCode})`);
      console.log(`Date: ${date}`);
      console.table(sourceMeta);
      console.log("Note: Sources tracked for quality assurance - not shown to users");
      console.groupEnd();

      setData(stocks);
      setSourceBreakdown(sourceMeta);
    } catch (error) {
      console.error("Failed to fetch broker data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTopData = () => {
    if (activeTab === "TopBuy") {
      return data.sort((a, b) => b.buyAmt - a.buyAmt);
    } else if (activeTab === "TopSell") {
      return data.sort((a, b) => b.sellAmt - a.sellAmt);
    } else {
      return data.sort((a, b) => Math.abs(b.netAmt) - Math.abs(a.netAmt));
    }
  };

  const topData = getTopData().slice(0, 10);
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.buyAmt, d.sellAmt)),
    1
  );

  const totals = {
    buy: data.reduce((sum, d) => sum + d.buyAmt, 0),
    sell: data.reduce((sum, d) => sum + d.sellAmt, 0),
    net: data.reduce((sum, d) => sum + d.netAmt, 0),
    buyTrans: data.filter((d) => d.buyAmt > 0).length,
    sellTrans: data.filter((d) => d.sellAmt > 0).length,
    matching: Math.min(
      data.reduce((sum, d) => sum + d.buyAmt, 0),
      data.reduce((sum, d) => sum + d.sellAmt, 0)
    ),
    matchingQty: data.reduce((sum, d) => sum + Math.min(d.buyQty, d.sellQty), 0),
    stockCount: data.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-sm text-muted">Loading data from multiple sources...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Broker Info */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">Broker Code: {brokerCode}</div>
            <div className="text-lg font-bold text-foreground">{brokerName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">{date}</div>
            <div className="text-sm font-semibold text-foreground">Real Data • {totals.stockCount} Stocks</div>
          </div>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex items-center gap-2 rounded-lg border border-border p-1">
        {(["TopBuy", "TopSell", "TopNet"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded px-3 py-2 text-xs font-semibold transition ${
              activeTab === tab
                ? "bg-primary text-white"
                : "bg-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "TopNet" ? "Top Net" : tab}
          </button>
        ))}
      </div>

      {/* Advanced Chart */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="mb-6 flex items-end justify-end gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500" />
            <span className="text-xs text-muted">Buy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span className="text-xs text-muted">Sell</span>
          </div>
        </div>

        {/* SVG Bar Chart */}
        {topData.length > 0 ? (
          <svg width="100%" height="300" viewBox="0 0 800 300" className="mb-4">
            {/* Grid lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={`grid-${i}`}
                x1="60"
                y1={250 - (i * 250) / 5}
                x2="780"
                y2={250 - (i * 250) / 5}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            ))}

            {/* Y-axis labels */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <text
                key={`label-${i}`}
                x="50"
                y={255 - (i * 250) / 5}
                textAnchor="end"
                fontSize="12"
                fill="#666"
              >
                {((maxValue * (i / 5)) / 1e7).toFixed(1)}Cr
              </text>
            ))}

            {/* Bars */}
            {topData.map((item, idx) => {
              const barWidth = 35;
              const spacing = 70;
              const x = 80 + idx * spacing;
              const buyHeight = (item.buyAmt / maxValue) * 250;
              const sellHeight = (item.sellAmt / maxValue) * 250;

              return (
                <g key={item.stockSymbol}>
                  {/* Buy bar */}
                  <rect
                    x={x}
                    y={250 - buyHeight}
                    width={barWidth / 2 - 2}
                    height={buyHeight}
                    fill="#22c55e"
                    rx="4"
                  />
                  {/* Sell bar */}
                  <rect
                    x={x + barWidth / 2}
                    y={250 - sellHeight}
                    width={barWidth / 2 - 2}
                    height={sellHeight}
                    fill="#ef4444"
                    rx="4"
                  />
                  {/* Label */}
                  <text
                    x={x + barWidth / 2}
                    y="270"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="bold"
                    fill="#333"
                  >
                    {item.stockSymbol}
                  </text>
                </g>
              );
            })}

            {/* X-axis */}
            <line x1="60" y1="250" x2="780" y2="250" stroke="#333" strokeWidth="2" />
            {/* Y-axis */}
            <line x1="60" y1="10" x2="60" y2="250" stroke="#333" strokeWidth="2" />
          </svg>
        ) : (
          <div className="py-12 text-center text-sm text-muted">No data available for this broker</div>
        )}

        {/* Tooltip for first stock */}
        {topData[0] && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs">
            <div className="font-semibold text-foreground">{topData[0].stockSymbol}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted">Buy Amt:</span> <span className="text-green-600 font-semibold">Rs. {formatNumber(topData[0].buyAmt)}</span>
              </div>
              <div>
                <span className="text-muted">Buy Qty:</span> <span className="font-semibold">{topData[0].buyQty.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted">Sell Amt:</span> <span className="text-red-600 font-semibold">Rs. {formatNumber(topData[0].sellAmt)}</span>
              </div>
              <div>
                <span className="text-muted">Sell Qty:</span> <span className="font-semibold">{topData[0].sellQty.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards (matching ShareHubNepal design) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Buy Amount" value={formatNumber(totals.buy)} />
        <StatCard label="Total Sell Amount" value={formatNumber(totals.sell)} />
        <StatCard label="Buy Transactions" value={totals.buyTrans.toString()} />
        <StatCard label="Sell Transactions" value={totals.sellTrans.toString()} />
        <StatCard label="Matching Amount" value={formatNumber(totals.matching)} />
        <StatCard label="Matching Quantity" value={totals.matchingQty.toLocaleString()} />
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 text-sm font-bold text-foreground truncate">{value}</div>
    </div>
  );
}

// Format number as Cr/L
function formatNumber(n: number): string {
  if (n === 0 || n === null || n === undefined) return "Rs. 0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `Rs. ${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `Rs. ${(n / 1e5).toFixed(2)}L`;
  return `Rs. ${n.toLocaleString("en-IN")}`;
}
