"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import LiveChart from "@/components/LiveChart";

export default function ChartPage() {
  const [symbol, setSymbol] = useState("NEPSE");
  const [symbolInput, setSymbolInput] = useState("NEPSE");
  const [allSymbols, setAllSymbols] = useState<string[]>([]);

  // Fetch all NEPSE stock symbols for search
  useEffect(() => {
    fetch("/api/live", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAllSymbols(["NEPSE", ...(j.data ?? []).map((d: { symbol: string }) => d.symbol).sort()]))
      .catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = symbolInput.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0f19] text-[#d1d4dc]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#222a3a] px-3 py-2">
        <Link href="/" className="text-sm font-bold text-[#8a93a6] hover:text-white">← NEPSE AXION</Link>

        <form onSubmit={handleSubmit} className="flex items-center">
          <input
            list="nepse-symbols"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Search stock…"
            className="w-40 rounded bg-[#161b27] px-2 py-1 text-sm font-bold uppercase text-white outline-none focus:ring-1 focus:ring-[#2962ff]"
          />
          <datalist id="nepse-symbols">
            {allSymbols.map((s) => <option key={s} value={s} />)}
          </datalist>
        </form>
        <span className="text-sm font-extrabold text-white">{symbol}</span>
        <span className="text-xs text-[#8a93a6]">{allSymbols.length} stocks</span>
      </div>

      {/* Chart — lightweight-charts (TradingView engine) + historical + live SSE */}
      <div className="flex-1 min-h-0 p-2">
        <LiveChart symbol={symbol} showHeader={true} />
      </div>
    </div>
  );
}
