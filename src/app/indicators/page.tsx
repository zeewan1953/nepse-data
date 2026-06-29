"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { INDICATOR_META } from "@/lib/indicators-meta";

interface IndicatorRow {
  symbol: string;
  indicatorName: string;
  rawValue: number | null;
  signal: string | null;
}

export default function IndicatorsPage() {
  const [date, setDate] = useState<string>("");
  const [data, setData] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/indicators/matrix");
      const json = await res.json();
      if (json.date) setDate(json.date);
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const indicatorMap = new Map<string, string[]>();
  for (const meta of INDICATOR_META) indicatorMap.set(meta.name, []);
  for (const row of data) {
    if (row.signal === "BUY") {
      const arr = indicatorMap.get(row.indicatorName);
      if (arr && arr.length < 5) arr.push(row.symbol);
    }
  }

  const indicators = INDICATOR_META.map(meta => ({ meta, buys: indicatorMap.get(meta.name) || [] }));

  return (
    <div className="p-3 text-[#e0e0e0] max-w-2xl mx-auto">
      <div className="mb-2">
        <h1 className="text-sm font-bold text-white m-0">Indicator Signals — BUY</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="bg-[#1a3a5c] text-[#8ab4f8] text-[10px] px-2 py-0.5 rounded border border-[#2a5a8c]">Daily timeframe</span>
          {date && <span className="text-[#999] text-[11px]">{date}</span>}
          <span className="text-[#00cc44] text-[11px]">max 5 per indicator</span>
        </div>
      </div>

      <div className="bg-[#1a1a00] border border-[#664400] text-[#cc9900] px-3 py-1.5 rounded text-[10px] mb-2">
        Backtested · not financial advice
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
              {indicators.map(({ meta, buys }, idx) => (
                <tr key={meta.name} className="hover:bg-[#0f0f1e]/60 transition">
                  <td className="px-2 py-1 text-[#556] text-[9px]">{idx + 1}</td>
                  <td className="px-2 py-1 font-medium text-[#7aa8f0] text-[10px] whitespace-nowrap">{meta.label}</td>
                  <td className="px-2 py-1 text-right">
                    {buys.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-0.5 justify-end">
                        {buys.map(sym => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
