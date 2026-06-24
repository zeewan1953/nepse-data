"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import type { LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, compact, num } from "@/lib/format";

const ohlc = (v: number) => v > 0 ? npr(v) : "—";

export default function MarketPanel({ liveData, noOuterBorder, mounted, compact: isCompact }: { liveData: LiveMarketData[] | undefined; noOuterBorder?: boolean; mounted?: boolean; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<"percentageChange" | "symbol" | "lastTradedPrice" | "totalTradeQuantity">("symbol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<"ALL" | "EQ" | "MF">("ALL");
  const [search, setSearch] = useState("");

  const setSorting = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "symbol" ? "asc" : "desc"); }
  };

  const rows = useMemo(() => {
    if (!liveData) return [];
    const list = liveData.filter((r) => {
      if (/\d/.test(r.symbol)) return false;
      const sType = classifySymbol(r.symbol, r.securityName);
      if (filter !== "ALL" && sType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.symbol.toLowerCase().includes(q) && !(r.securityName ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string") return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [liveData, sortKey, sortDir, filter, search]);

  const displayed = expanded ? rows : rows.slice(0, isCompact ? 5 : 10);

  const arrow = (k: typeof sortKey) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <section className={noOuterBorder ? "" : "rounded-xl border border-border bg-surface shadow-sm overflow-hidden"}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-foreground">Live Market</h2>
          <span className="text-[10px] text-muted">{mounted ? rows.length : "..."} stocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-[10px] font-semibold sm:flex">
            {(["ALL", "EQ", "MF"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={`rounded px-2 py-0.5 transition ${filter === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{t}</button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-28 rounded border border-border bg-surface px-2 py-1 text-[10px] outline-none focus:border-primary sm:w-40" />
          <button onClick={() => setExpanded(!expanded)} className="rounded-lg bg-surface-2 px-3 py-1 text-[10px] font-bold text-primary hover:bg-surface-2/80">
            {expanded ? "Show Less" : (mounted ? `Show All (${rows.length})` : "Show All (...)")}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ maxHeight: isCompact ? "200px" : noOuterBorder ? "340px" : "500px", overflowY: "auto" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th onClick={() => setSorting("symbol")} className="cursor-pointer px-2 py-1.5 text-left font-semibold hover:text-primary">Symbol{arrow("symbol")}</th>
              <th className="px-2 py-1.5 text-left font-semibold">Type</th>
              <th className="px-2 py-1.5 text-left font-semibold">Company</th>
              <th onClick={() => setSorting("lastTradedPrice")} className="cursor-pointer px-2 py-1.5 text-right font-semibold hover:text-primary">LTP{arrow("lastTradedPrice")}</th>
              <th onClick={() => setSorting("percentageChange")} className="cursor-pointer px-2 py-1.5 text-right font-semibold hover:text-primary">% Chg{arrow("percentageChange")}</th>
              <th className="px-2 py-1.5 text-right font-semibold">Open</th>
              <th className="px-2 py-1.5 text-right font-semibold">High</th>
              <th className="px-2 py-1.5 text-right font-semibold">Low</th>
              <th className="px-2 py-1.5 text-right font-semibold">Vol</th>
              <th className="px-2 py-1.5 text-right font-semibold">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {!mounted && (
              <tr><td colSpan={10} className="px-2 py-6 text-center text-muted">Loading market data...</td></tr>
            )}
            {mounted && displayed.map((r) => {
              const chg = r.percentageChange;
              const rowBg = chg > 0 ? "opacity-80 hover:opacity-100" : chg < 0 ? "opacity-90 hover:opacity-100" : "";
              const sType = classifySymbol(r.symbol, r.securityName);
              return (
                <tr key={r.symbol} className={`border-t border-border/50 ${rowBg} transition`} style={chg > 0 ? { background: "rgba(34,197,94,0.08)" } : chg < 0 ? { background: "rgba(239,68,68,0.08)" } : {}}>
                  <td className="px-2 py-1.5">
                    <Link href={`/stock/${r.symbol}`} className="font-bold text-foreground hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${TYPE_BADGE[sType]}`}>{sType}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1.5 text-foreground">{r.securityName}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-foreground">{npr(r.lastTradedPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: chg > 0 ? "var(--color-up, #22c55e)" : chg < 0 ? "var(--color-down, #ef4444)" : "var(--color-muted, #888)" }}>{pct(chg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{ohlc(r.openPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{ohlc(r.highPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{ohlc(r.lowPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{num(r.totalTradeQuantity)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{compact(r.totalTradeValue)}</td>
                </tr>
              );
            })}
            {mounted && liveData && displayed.length === 0 && (
              <tr><td colSpan={10} className="px-2 py-6 text-center text-muted">No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
