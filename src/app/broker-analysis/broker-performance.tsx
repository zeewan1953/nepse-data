"use client";
import React, { useState, useEffect } from "react";
import { BrokerStocksGrid } from "@/components/BrokerStocksGrid";
import { BrokerStockActivityChart } from "@/components/BrokerStockActivityChart";
import { RANGE_LABELS } from "@/lib/trading-constants";

type TimeRange = "1D" | "3D" | "1W" | "1M" | "3M";
type BrokerPerformance = {
  brokerCode: string;
  brokerName: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  turnover: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  transactionCount: number;
  daysActive: number;
  avgDaily: number;
};

type RangeData = {
  range: TimeRange;
  brokers: BrokerPerformance[];
  marketTurnover: number;
  totalTransactions: number;
  avgNetFlow: number;
  topBrokerBuy: BrokerPerformance;
  topBrokerSell: BrokerPerformance;
};

export function BrokerPerformanceSection() {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("1D");
  const [rangeData, setRangeData] = useState<Record<TimeRange, RangeData>>({} as any);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"buyAmt" | "sellAmt" | "netAmt" | "turnover">("netAmt");
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);

  useEffect(() => {
    const fetchAllRangesData = async () => {
      setLoading(true);
      const ranges = ["1D", "3D", "1W", "1M", "3M"] as TimeRange[];
      try {
        await Promise.all(
          ranges.map(async (range) => {
            try {
              const response = await fetch(`/api/broker-performance?range=${range}`);
              const data = await response.json();
              if (data.brokers && data.brokers.length > 0) {
                const entry: RangeData = {
                  range,
                  brokers: data.brokers || [],
                  marketTurnover: data.marketTurnover || 0,
                  totalTransactions: data.totalTransactions || 0,
                  avgNetFlow: data.avgNetFlow || 0,
                  topBrokerBuy: data.topBrokerBuy,
                  topBrokerSell: data.topBrokerSell,
                };
                setRangeData((prev) => ({ ...prev, [range]: entry }));
                setLoading(false);
              }
            } catch (error) {
              console.error(`Failed to fetch ${range} data:`, error);
            }
          }),
        );
      } catch (error) {
        console.error("Failed to fetch broker performance:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllRangesData();
    const id = setInterval(fetchAllRangesData, 5000);
    return () => clearInterval(id);
  }, []);

  const currentData = rangeData[selectedRange];

  if (loading && !currentData) {
    return (
      <div className="space-y-4 p-3 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-3">
              <div className="h-3 w-20 rounded bg-surface-2 mb-2" />
              <div className="h-6 w-24 rounded bg-surface-2" />
            </div>
          ))}
        </div>
        <div className="h-8 w-60 rounded bg-surface-2" />
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <th key={j} className="px-3 py-2"><div className="h-3 w-14 rounded bg-surface-2" /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 w-16 rounded bg-surface-2" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (!currentData || !currentData.brokers?.length) {
    return (
      <div className="p-6 text-center">
        <div className="h-32 animate-pulse rounded-lg bg-surface-2 mb-4" />
        <p className="text-sm text-muted">Broker performance data not available for this period.</p>
      </div>
    );
  }

  const sortedBrokers = [...currentData.brokers].sort((a, b) => {
    if (sortBy === "buyAmt") return b.buyAmount - a.buyAmount;
    if (sortBy === "sellAmt") return b.sellAmount - a.sellAmount;
    if (sortBy === "turnover") return b.turnover - a.turnover;
    return b.netAmount - a.netAmount;
  });

  return (
    <div className="space-y-6">
      {/* Market Overview Cards */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Market Overview - {RANGE_LABELS[selectedRange]}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Turnover"
            value={formatNumber(currentData.marketTurnover)}
            subtext={`${currentData.brokers.length} brokers`}
          />
          <StatCard
            label="Total Transactions"
            value={formatLarge(currentData.totalTransactions)}
            subtext="All brokers"
          />
          <StatCard
            label="Avg Net Flow"
            value={formatNumber(currentData.avgNetFlow)}
            subtext="Per broker"
            color={currentData.avgNetFlow >= 0 ? "text-green-600" : "text-red-600"}
          />
          <StatCard
            label="Active Brokers"
            value={currentData.brokers.length.toString()}
            subtext="Total"
          />
        </div>
      </div>

      {/* Top Broker Highlights */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Top Performers - {RANGE_LABELS[selectedRange]}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentData.topBrokerBuy && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="text-xs font-semibold text-green-700 uppercase mb-2">🟢 Top Buyer</div>
              <div className="text-lg font-bold text-green-900">{currentData.topBrokerBuy.brokerCode}</div>
              <div className="text-sm text-green-800 mt-1">{currentData.topBrokerBuy.brokerName}</div>
              <div className="mt-2 text-sm font-semibold text-green-700">
                Buy: {formatNumber(currentData.topBrokerBuy.buyAmount)}
              </div>
              <div className="text-sm text-green-700">
                Net: {formatNumber(currentData.topBrokerBuy.netAmount)}
              </div>
            </div>
          )}
          {currentData.topBrokerSell && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-semibold text-red-700 uppercase mb-2">🔴 Top Seller</div>
              <div className="text-lg font-bold text-red-900">{currentData.topBrokerSell.brokerCode}</div>
              <div className="text-sm text-red-800 mt-1">{currentData.topBrokerSell.brokerName}</div>
              <div className="mt-2 text-sm font-semibold text-red-700">
                Sell: {formatNumber(currentData.topBrokerSell.sellAmount)}
              </div>
              <div className="text-sm text-red-700">
                Net: {formatNumber(currentData.topBrokerSell.netAmount)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Time Range Selector */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">View All Brokers Performance</h3>
        <div className="flex items-center gap-2 rounded-lg border border-border p-2 flex-wrap">
          {(["1D", "3D", "1W", "1M", "3M"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`rounded px-3 py-2 text-sm font-semibold transition ${
                selectedRange === range
                  ? "bg-primary text-white"
                  : "bg-transparent text-muted hover:text-foreground hover:bg-surface"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Broker Performance Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">All Brokers - {RANGE_LABELS[selectedRange]}</h3>
          <div className="text-xs text-muted">Sort by:</div>
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(["buyAmt", "sellAmt", "netAmt", "turnover"] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`rounded px-2 py-1 text-xs font-semibold transition ${
                sortBy === sort
                  ? "bg-primary/20 text-primary"
                  : "bg-transparent text-muted hover:text-foreground"
              }`}
            >
              {sort === "buyAmt"
                ? "Buy Amount"
                : sort === "sellAmt"
                ? "Sell Amount"
                : sort === "netAmt"
                ? "Net Flow"
                : "Turnover"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Broker</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Buy Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Sell Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Buy Amt</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Sell Amt</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Net</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Turnover</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Txns</th>
                </tr>
              </thead>
              <tbody>
                {sortedBrokers.map((broker, idx) => (
                  <React.Fragment key={broker.brokerCode}>
                    {/* Broker Row */}
                    <tr className="border-b border-border hover:bg-surface-2 transition cursor-pointer" onClick={() => setExpandedBroker(expandedBroker === broker.brokerCode ? null : broker.brokerCode)}>
                      <td className="px-3 py-2 text-sm font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">{expandedBroker === broker.brokerCode ? '▼' : '▶'}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-600 inline-block">
                            {broker.brokerCode}
                          </span>
                          <span className="text-xs text-muted">{broker.brokerName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-green-600">
                        {formatLarge(broker.buyVolume)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-red-600">
                        {formatLarge(broker.sellVolume)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-green-600">
                        {formatNumber(broker.buyAmount)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-red-600">
                        {formatNumber(broker.sellAmount)}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold ${broker.netAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {broker.netAmount >= 0 ? "+" : ""}{formatNumber(broker.netAmount)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">
                        {formatNumber(broker.turnover)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted">
                        {formatLarge(broker.transactionCount)}
                      </td>
                    </tr>

                    {/* Expanded Stocks Chart */}
                    {expandedBroker === broker.brokerCode && (
                      <tr className="border-b border-border bg-surface-2">
                        <td colSpan={8} className="px-6 py-4">
                          <BrokerStockActivityChart
                            brokerCode={broker.brokerCode}
                            brokerName={broker.brokerName}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 rounded-lg border border-border bg-surface-2 text-xs text-muted">
          Showing {sortedBrokers.length} brokers for {RANGE_LABELS[selectedRange]} • Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || "text-foreground"}`}>{value}</div>
      {subtext && <div className="text-xs text-muted mt-1">{subtext}</div>}
    </div>
  );
}

// Formatters
function formatNumber(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatLarge(n: number): string {
  if (n === null || n === undefined) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
