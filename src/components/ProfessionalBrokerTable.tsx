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

interface ProfessionalBrokerTableProps {
  data: BrokerData[];
  date: string;
  range: "1D" | "2D" | "3D" | "1W" | "1M" | "3M" | "6M" | "1Y";
}

export function ProfessionalBrokerTable({ data, date, range }: ProfessionalBrokerTableProps) {
  const [sortBy, setSortBy] = useState<keyof BrokerData>("turnover");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");

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

  return (
    <div className="space-y-4">
      {/* Header Info */}
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
          <table className="w-full min-w-[1600px]">
            {/* Header */}
            <thead>
              <tr className="bg-surface-2 border-b border-border sticky top-0">
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted">
                  <button onClick={() => handleSort("brokerCode")} className="hover:text-foreground">
                    Broker <SortIcon column="brokerCode" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button onClick={() => handleSort("turnover")} className="hover:text-foreground flex items-center justify-end gap-1">
                    Turnover <SortIcon column="turnover" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button onClick={() => handleSort("buyAmt")} className="hover:text-foreground flex items-center justify-end gap-1">
                    Buy Amt <SortIcon column="buyAmt" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Vol</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Avg Buy</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Trans</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Buy Vol %</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button onClick={() => handleSort("sellAmt")} className="hover:text-foreground flex items-center justify-end gap-1">
                    Sell Amt <SortIcon column="sellAmt" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Vol</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Avg Sell</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Trans</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Sell Vol %</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">
                  <button onClick={() => handleSort("matchingAmt")} className="hover:text-foreground flex items-center justify-end gap-1">
                    Matching Amt <SortIcon column="matchingAmt" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Matching Vol</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Matching Trans</th>
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
                    Rs. {broker.avgBuy.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
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
                    Rs. {broker.avgSell.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>

                  {/* Sell Trans */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.sellTrans.toLocaleString()}
                  </td>

                  {/* Sell Vol % */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.sellVolPct.toFixed(2)}
                  </td>

                  {/* Matching Amount */}
                  <td className="px-2 py-2 text-right text-xs font-semibold text-blue-600 tabular-nums">
                    {formatAmount(broker.matchingAmt)}
                  </td>

                  {/* Matching Volume */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {formatVolume(broker.matchingVol)}
                  </td>

                  {/* Matching Trans */}
                  <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">
                    {broker.matchingTrans.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-xs text-muted text-center py-2 border-t border-border">
        Showing {processedData.length} brokers • Last updated: {new Date().toLocaleString("en-IN")}
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
