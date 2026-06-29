"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { INDICATOR_META, type IndicatorMeta } from "@/lib/indicators-meta";

interface IndicatorRow {
  symbol: string;
  indicatorName: string;
  rawValue: number | null;
  signal: string | null;
}

export default function IndicatorsPage() {
  const [date, setDate] = useState<string>("");
  const [data, setData] = useState<IndicatorRow[]>([]);
  const [maxBars, setMaxBars] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/indicators/matrix");
      const json = await res.json();
      if (json.date) setDate(json.date);
      if (typeof json.maxOhlcvBars === "number") setMaxBars(json.maxOhlcvBars);
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const indicatorMap = new Map<string, { buys: string[]; sells: string[] }>();
  for (const meta of INDICATOR_META) indicatorMap.set(meta.name, { buys: [], sells: [] });
  for (const row of data) {
    const entry = indicatorMap.get(row.indicatorName);
    if (!entry) continue;
    if (row.signal === "BUY" && entry.buys.length < 5) entry.buys.push(row.symbol);
    if (row.signal === "SELL" && entry.sells.length < 5) entry.sells.push(row.symbol);
  }

  const hasData = (meta: IndicatorMeta): boolean => {
    const e = indicatorMap.get(meta.name);
    if (!e) return false;
    return e.buys.length > 0 || e.sells.length > 0;
  };

  const canCompute = (meta: IndicatorMeta): boolean => {
    if (meta.externalSource) return true;
    return maxBars >= meta.barsRequired;
  };

  const activeIndicators = INDICATOR_META.filter(m => hasData(m));
  const waitingIndicators = INDICATOR_META.filter(m => !hasData(m));

  return (
    <div className="p-3 text-[#e0e0e0] max-w-2xl mx-auto">
      <div className="mb-3">
        <h1 className="text-sm font-bold text-white m-0">Indicator Signals</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="bg-[#1a3a5c] text-[#8ab4f8] text-[10px] px-2 py-0.5 rounded border border-[#2a5a8c]">Daily</span>
          {date && <span className="text-[#999] text-[10px]">{date}</span>}
          <span className="text-[#00cc44] text-[10px]">BUY signals shown · max 5 stocks</span>
          <span className="text-[#667] text-[10px]">|</span>
          <span className="text-[#667] text-[10px]">{maxBars} days of OHLCV data</span>
        </div>
      </div>

      {loading ? (
        <div className="text-[#888] py-8 text-center text-xs">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1a1a2e]">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[#0f0f1e] border-b border-[#1a1a2e] text-[#667] text-[9px] font-semibold uppercase tracking-wider">
                <th className="text-left px-2 py-1.5">#</th>
                <th className="text-left px-2 py-1.5">Indicator</th>
                <th className="text-right px-2 py-1.5">Stocks (BUY)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a2e]">
              {activeIndicators.map((meta, idx) => {
                const e = indicatorMap.get(meta.name)!;
                return (
                  <tr key={meta.name} className="hover:bg-[#0f0f1e]/60 transition">
                    <td className="px-2 py-1 text-[#556] text-[9px]">{idx + 1}</td>
                    <td className="px-2 py-1 font-medium text-[#7aa8f0] text-[10px] whitespace-nowrap">{meta.label}</td>
                    <td className="px-2 py-1 text-right">
                      {e.buys.length > 0 ? (
                        <span className="inline-flex flex-wrap gap-0.5 justify-end">
                          {e.buys.map(sym => (
                            <Link key={sym} href={`/stock/${sym}`}
                              className="rounded bg-[#00cc44]/10 px-1.5 py-0.5 font-semibold text-[#00cc44] text-[9px] no-underline hover:bg-[#00cc44]/20">
                              {sym}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[#333]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {waitingIndicators.length > 0 && (
            <>
              <div className="bg-[#0a0a14] border-t border-[#1a1a2e] px-3 py-1.5 text-[9px] text-[#556] font-semibold uppercase tracking-wider">
                Insufficient data ({waitingIndicators.length} indicators need more trading days)
              </div>
              <table className="w-full text-[10px]">
                <tbody className="divide-y divide-[#1a1a2e]">
                  {waitingIndicators.map((meta) => {
                    const e = indicatorMap.get(meta.name)!;
                    return (
                      <tr key={meta.name} className="opacity-40">
                        <td className="px-2 py-1 text-[#667] text-[9px]">—</td>
                        <td className="px-2 py-1 font-medium text-[#667] text-[10px] whitespace-nowrap">{meta.label}</td>
                        <td className="px-2 py-1 text-right text-[#444] text-[9px]">
                          {!meta.externalSource && meta.barsRequired > maxBars
                            ? `needs ${meta.barsRequired} days · have ${maxBars}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="mt-2 text-[9px] text-[#555] text-center">
        Indicators accumulate data daily. More OHLCV history = more signals
      </div>
    </div>
  );
}
