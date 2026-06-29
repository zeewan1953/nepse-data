"use client";
import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/useLive";
import { num } from "@/lib/format";

type SectorData = {
  sector: string;
  stockCount: number;
  totalTurnover: number;
  avgPctChange: number | null;
  topGainer: { symbol: string; pctChange: number } | null;
  topLoser: { symbol: string; pctChange: number } | null;
};

type HeatmapResp = {
  date: string | null;
  sectors: SectorData[];
};

export default function SectorsPage() {
  const heatmap = usePoll<HeatmapResp>("/api/sectors/heatmap", 30_000);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const sectors = heatmap.data?.sectors ?? [];
  const maxTurnover = Math.max(...sectors.map(s => s.totalTurnover), 1);

  const getTileColor = (avgPctChange: number | null) => {
    if (avgPctChange === null || avgPctChange === undefined) return "bg-gray-600";
    if (avgPctChange > 2) return "bg-[#00cc44]";
    if (avgPctChange > 1) return "bg-[#33d466]";
    if (avgPctChange > 0) return "bg-[#66dd88]";
    if (avgPctChange === 0) return "bg-gray-500";
    if (avgPctChange > -1) return "bg-[#ff6666]";
    if (avgPctChange > -2) return "bg-[#ff3333]";
    return "bg-[#e60000]";
  };

  const getTileTextColor = (avgPctChange: number | null) => {
    if (avgPctChange === null || avgPctChange === undefined) return "text-gray-300";
    return "text-white";
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-space">Sector Heatmap</h1>
        {heatmap.data?.date && (
          <span className="text-xs text-muted font-mono">
            {heatmap.data.date}
          </span>
        )}
      </div>

      {sectors.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <p>No sector data available for today</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {sectors.map((sector) => {
            const tileSize = Math.max(
              1,
              Math.round((sector.totalTurnover / maxTurnover) * 4)
            );
            const colSpan = tileSize >= 3 ? "md:col-span-2" : "";
            const rowSpan = tileSize >= 4 ? "md:row-span-2" : "";

            return (
              <button
                key={sector.sector}
                onClick={() =>
                  setSelectedSector(
                    selectedSector === sector.sector ? null : sector.sector
                  )
                }
                className={`${colSpan} ${rowSpan} ${getTileColor(
                  sector.avgPctChange
                )} ${getTileTextColor(sector.avgPctChange)} 
                  p-3 rounded-lg hover:opacity-80 transition-all text-left border border-border/20`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm font-space truncate">
                      {sector.sector}
                    </div>
                    <div className="text-xs mt-1 opacity-80">
                      {sector.stockCount} stocks
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono">
                      {sector.avgPctChange !== null &&
                      sector.avgPctChange !== undefined
                        ? `${sector.avgPctChange > 0 ? "+" : ""}${
                            sector.avgPctChange
                          }%`
                        : "—"}
                    </div>
                    <div className="text-xs opacity-70">
                      {num(sector.totalTurnover)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedSector && (
        <div className="card p-4">
          <h2 className="text-lg font-bold font-space mb-3">
            {selectedSector} Details
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted">Stocks:</span>
              <span className="ml-2 font-mono">
                {sectors.find(s => s.sector === selectedSector)?.stockCount}
              </span>
            </div>
            <div>
              <span className="text-muted">Turnover:</span>
              <span className="ml-2 font-mono">
                {num(sectors.find(s => s.sector === selectedSector)?.totalTurnover ?? 0)}
              </span>
            </div>
            <div>
              <span className="text-muted">Top Gainer:</span>
              <span className="ml-2 font-mono text-up">
                {sectors.find(s => s.sector === selectedSector)?.topGainer?.symbol ?? "—"}
              </span>
            </div>
            <div>
              <span className="text-muted">Top Loser:</span>
              <span className="ml-2 font-mono text-down">
                {sectors.find(s => s.sector === selectedSector)?.topLoser?.symbol ?? "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="card p-3 text-xs text-muted">
        <div className="flex items-center gap-4 flex-wrap">
          <span>Legend:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-[#00cc44] rounded"></span>
            Strong Positive (&gt;2%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-[#66dd88] rounded"></span>
            Positive (0-2%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-gray-500 rounded"></span>
            Flat (0%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-[#ff6666] rounded"></span>
            Negative (0 to -2%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-[#e60000] rounded"></span>
            Strong Negative (&lt;-2%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-gray-600 rounded"></span>
            No Data (—)
          </span>
        </div>
      </div>
    </div>
  );
}
