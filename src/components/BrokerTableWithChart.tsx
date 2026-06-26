"use client";
import { useState, useMemo } from "react";

interface BrokerData {
  brokerCode: string;
  brokerName: string;
  turnover: number;
  buyAmt: number;
  buyVol: number;
  avgBuy: number;
  buyTrans: number;
  buyVolPct: number;
  sellAmt: number;
  sellVol: number;
  avgSell: number;
  sellTrans: number;
  sellVolPct: number;
  matchingAmt: number;
  matchingVol: number;
  matchingTrans: number;
}

interface BrokerTableWithChartProps {
  data: BrokerData[];
  date: string;
  range: "1D" | "2D" | "3D" | "1W" | "1M" | "3M" | "6M" | "1Y";
}

export function BrokerTableWithChart({ data, date, range }: BrokerTableWithChartProps) {
  const [sortBy, setSortBy] = useState<keyof BrokerData>("turnover");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);

  // Find max value for scaling
  const maxBuyAmt = useMemo(() => Math.max(...data.map((b) => b.buyAmt), 1), [data]);
  const maxSellAmt = useMemo(() => Math.max(...data.map((b) => b.sellAmt), 1), [data]);
  const maxAmount = Math.max(maxBuyAmt, maxSellAmt);

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = data.filter(
      (broker) =>
        broker.brokerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        broker.brokerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
      }

      return sortOrder === "desc"
        ? String(bValue).localeCompare(String(aValue))
        : String(aValue).localeCompare(String(bValue));
    });
  }, [data, sortBy, sortOrder, searchTerm]);

  const handleSort = (column: keyof BrokerData) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ column }: { column: keyof BrokerData }) => {
    if (sortBy !== column) return <span className="text-muted">⇅</span>;
    return <span>{sortOrder === "desc" ? "↓" : "↑"}</span>;
  };

  // Mini bar chart component
  const MiniBarChart = ({ broker }: { broker: BrokerData }) => {
    const chartHeight = 25;
    const barWidth = 10;
    const chartWidth = 55;
    const padding = 2;

    // Ensure we have valid heights (minimum 1 pixel for visibility)
    const buyHeight = Math.max(1, (broker.buyAmt / maxAmount) * chartHeight);
    const sellHeight = Math.max(1, (broker.sellAmt / maxAmount) * chartHeight);

    return (
      <div className="flex items-end gap-1">
        {/* Buy bar */}
        <div className="flex flex-col items-center">
          <div
            style={{
              width: `${barWidth}px`,
              height: `${buyHeight}px`,
              backgroundColor: '#22c55e',
              borderRadius: '2px',
              minHeight: '4px',
            }}
          />
          <span className="text-xs text-muted mt-0.5 font-bold">B</span>
        </div>

        {/* Sell bar */}
        <div className="flex flex-col items-center">
          <div
            style={{
              width: `${barWidth}px`,
              height: `${sellHeight}px`,
              backgroundColor: '#ef4444',
              borderRadius: '2px',
              minHeight: '4px',
            }}
          />
          <span className="text-xs text-muted mt-0.5 font-bold">S</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Broker Analysis Summary</h2>
          <div className="text-xs text-muted mt-1">
            Total Brokers: <span className="font-semibold text-foreground">{data.length}</span>
            {" | "}
            Date: <span className="font-semibold text-foreground">{date}</span>
            {" | "}
            Range: <span className="font-semibold text-foreground">{range}</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search Broker..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-foreground placeholder-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="text-xs text-muted font-semibold">
          Showing {processedData.length} of {data.length}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px]">
            {/* Header */}
            <thead>
              <tr className="bg-surface-2 border-b border-border sticky top-0">
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted">
                  <button
                    onClick={() => handleSort("brokerCode")}
                    className="hover:text-foreground flex items-center gap-1"
                  >
                    Broker <SortIcon column="brokerCode" />
                  </button>
                </th>

                {/* Chart Column */}
                <th className="px-2 py-2 text-center text-xs font-semibold text-muted">Chart</th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button
                    onClick={() => handleSort("turnover")}
                    className="hover:text-foreground flex items-center justify-end gap-1 w-full"
                  >
                    Turnover <SortIcon column="turnover" />
                  </button>
                </th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button
                    onClick={() => handleSort("buyAmt")}
                    className="hover:text-foreground flex items-center justify-end gap-1 w-full"
                  >
                    Buy Amt <SortIcon column="buyAmt" />
                  </button>
                </th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Vol</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Avg Buy</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Trans</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Vol %</th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button
                    onClick={() => handleSort("sellAmt")}
                    className="hover:text-foreground flex items-center justify-end gap-1 w-full"
                  >
                    Sell Amt <SortIcon column="sellAmt" />
                  </button>
                </th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Vol</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Avg Sell</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Trans</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Vol %</th>

                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button
                    onClick={() => handleSort("matchingAmt")}
                    className="hover:text-foreground flex items-center justify-end gap-1 w-full"
                  >
                    Matching <SortIcon column="matchingAmt" />
                  </button>
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {processedData.map((broker, idx) => (
                <tr
                  key={broker.brokerCode}
                  className={`border-b border-border hover:bg-primary/5 transition ${
                    idx % 2 === 0 ? "bg-surface" : "bg-surface-2/30"
                  }`}
                >
                  {/* Broker Info */}
                  <td className="px-2 py-2 text-left sticky left-0 bg-inherit z-10">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 min-w-fit">
                        {broker.brokerCode}
                      </span>
                      <div className="text-xs font-semibold text-foreground truncate max-w-xs">
                        {broker.brokerName}
                      </div>
                    </div>
                  </td>

                  {/* Mini Chart */}
                  <td className="px-2 py-2 text-center">
                    <MiniBarChart broker={broker} />
                  </td>

                  {/* Turnover */}
                  <td className="px-2 py-2 text-right text-xs font-semibold text-foreground tabular-nums">
                    {formatAmount(broker.turnover)}
                  </td>

                  {/* Buy Amount */}
                  <td className="px-2 py-2 text-right text-xs font-semibold text-green-600 tabular-nums">
                    {formatAmount(broker.buyAmt)}
                  </td>

                  {/* Buy Volume */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {formatVolume(broker.buyVol)}
                  </td>

                  {/* Avg Buy */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.avgBuy.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>

                  {/* Buy Trans */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.buyTrans.toLocaleString()}
                  </td>

                  {/* Buy Vol % */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.buyVolPct.toFixed(2)}
                  </td>

                  {/* Sell Amount */}
                  <td className="px-2 py-2 text-right text-xs font-semibold text-red-600 tabular-nums">
                    {formatAmount(broker.sellAmt)}
                  </td>

                  {/* Sell Volume */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {formatVolume(broker.sellVol)}
                  </td>

                  {/* Avg Sell */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.avgSell.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>

                  {/* Sell Trans */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.sellTrans.toLocaleString()}
                  </td>

                  {/* Sell Vol % */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.sellVolPct.toFixed(2)}
                  </td>

                  {/* Matching */}
                  <td className="px-2 py-2 text-right text-xs font-semibold text-blue-600 tabular-nums">
                    {formatAmount(broker.matchingAmt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted text-center py-2 border-t border-border">
        <div>Showing {processedData.length} brokers • Last updated: {new Date().toLocaleString("en-IN")}</div>
        <div className="mt-1 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded bg-green-500"></div>
            <span>Buy Volume</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded bg-red-500"></div>
            <span>Sell Volume</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Format amount helper
function formatAmount(amount: number): string {
  if (amount === 0) return "Rs. 0";
  const abs = Math.abs(amount);

  if (abs >= 1e7) {
    return `Rs. ${(amount / 1e7).toFixed(2)} Cr`;
  }
  if (abs >= 1e5) {
    return `Rs. ${(amount / 1e5).toFixed(2)} L`;
  }
  if (abs >= 1e3) {
    return `Rs. ${(amount / 1e3).toFixed(2)}K`;
  }

  return `Rs. ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Format volume helper
function formatVolume(volume: number): string {
  if (volume === 0) return "0";
  if (volume >= 1e6) {
    return `${(volume / 1e6).toFixed(1)}M`;
  }
  if (volume >= 1e3) {
    return `${(volume / 1e3).toFixed(0)}K`;
  }
  return volume.toLocaleString("en-IN");
}
