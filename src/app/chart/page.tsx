"use client";
import { useEffect, useState, useCallback } from "react";
import LiveChart from "@/components/LiveChart";

const PRESETS = ["NEPSE", "NABIL", "NTC", "SHIVM", "API", "CZBIL", "LICN", "HIDCL"];

export default function ChartPage() {
  const [symbol, setSymbol] = useState("NEPSE");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.length < 1) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/chart/symbols?query=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then(r => r.json())
        .then((d: { symbol: string; name: string }[]) => setResults(d.slice(0, 15)))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const select = useCallback((s: string) => {
    setSymbol(s);
    setQuery("");
    setResults([]);
    setOpen(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0f19]">
      {/* ── top toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[#1e2538] px-2 py-1.5">
        <a href="/" className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-[#787b86] hover:text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m7-7-7 7 7 7"/></svg>
          NEPSE AXION
        </a>

        <div className="relative">
          <input
            value={open ? query : symbol}
            onFocus={() => setOpen(true)}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={e => { if (e.key === "Enter" && results.length) select(results[0].symbol); }}
            placeholder="Search symbol..."
            className="h-7 w-44 rounded border border-[#2a2e39] bg-[#131722] px-2 text-xs font-medium uppercase tracking-wide text-white outline-none focus:border-[#2962ff]"
          />
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setQuery(""); setResults([]); }} />
              <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-[#2a2e39] bg-[#131722] py-1 shadow-2xl">
                {results.length === 0 && query.length > 0 && (
                  <div className="px-3 py-2 text-xs text-[#787b86]">No results</div>
                )}
                {results.length === 0 && query.length === 0 && (
                  <div>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase text-[#787b86]">Popular</div>
                    {PRESETS.map(s => (
                      <button key={s} onClick={() => select(s)} className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-white hover:bg-[#2a2e39]">
                        <span className="font-medium">{s}</span>
                        <span className="text-[#787b86]">NEPSE</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.map(r => (
                  <button key={r.symbol} onClick={() => select(r.symbol)} className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-white hover:bg-[#2a2e39]">
                    <span className="font-medium">{r.symbol}</span>
                    <span className="text-[#787b86] truncate ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── chart ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <LiveChart symbol={symbol} />
      </div>
    </div>
  );
}
