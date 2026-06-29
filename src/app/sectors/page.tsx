"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { npr } from "@/lib/format";

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

interface SectorTile {
  sector: string;
  stockCount: number;
  totalTurnover: number;
  avgPctChange: number | null;
  topGainer: { symbol: string; pctChange: number } | null;
  topLoser: { symbol: string; pctChange: number } | null;
}

export default function SectorHeatmapPage() {
  const [date, setDate] = useState("");
  const [sectors, setSectors] = useState<SectorTile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sectors/heatmap")
      .then(r => r.json())
      .then(j => {
        setDate(j.date || "");
        setSectors(j.sectors || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxTurnover = Math.max(...sectors.map(s => s.totalTurnover), 1);

  const tileBg = (pct: number | null): string => {
    if (pct === null) return "bg-[#1a1a2e]";
    if (pct >= 0) {
      const intensity = Math.min(Math.abs(pct) / 3, 1);
      const g = Math.round(0x11 + (0x44 - 0x11) * intensity);
      return `rgb(0, ${g}, 0)`;
    }
    const intensity = Math.min(Math.abs(pct) / 3, 1);
    const r = Math.round(0x33 + (0x66 - 0x33) * intensity);
    return `rgb(${r}, 0, 0)`;
  };

  const textColor = (pct: number | null): string => {
    if (pct === null) return "text-[#555]";
    if (pct >= 0) return "text-[#00cc44]";
    return "text-[#e60000]";
  };

  if (loading) {
    return <div className="p-4 text-sm text-[#888]">Loading...</div>;
  }

  return (
    <div className="p-3 text-[#e0e0e0] max-w-4xl mx-auto">
      <div className="mb-3">
        <h1 className="text-sm font-bold text-white">Sector Heatmap</h1>
        {date && <span className="text-[#999] text-[11px]">{date}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sectors.map(s => {
          const pct = s.avgPctChange;
          const tileW = Math.max(60, (s.totalTurnover / maxTurnover) * 100);
          return (
            <Link
              key={s.sector}
              href={`/market?sector=${encodeURIComponent(s.sector)}`}
              className="block rounded-lg border border-[#1a1a2e] p-3 transition hover:border-[#334] no-underline"
              style={{ background: tileBg(pct), gridColumn: `span ${tileW > 80 ? 2 : 1}` }}
            >
              <div className="text-[11px] font-semibold text-white truncate">{s.sector}</div>
              <div className={`text-[13px] font-bold tabular-nums mt-1 ${textColor(pct)}`}>
                {pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-[#667]">
                <span>{s.stockCount} stocks</span>
                <span>{npr(s.totalTurnover)}</span>
              </div>
              {(s.topGainer || s.topLoser) && (
                <div className="mt-1 text-[8px] leading-tight">
                  {s.topGainer && (
                    <div className="text-[#00cc44]">
                      ▲ {s.topGainer.symbol} {fmtPct(s.topGainer.pctChange)}
                    </div>
                  )}
                  {s.topLoser && (
                    <div className="text-[#e60000]">
                      ▼ {s.topLoser.symbol} {fmtPct(s.topLoser.pctChange)}
                    </div>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {sectors.length === 0 && !loading && (
        <div className="text-center text-[#555] text-xs py-8">No sector data available</div>
      )}
    </div>
  );
}
