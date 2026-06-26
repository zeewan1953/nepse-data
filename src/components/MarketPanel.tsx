"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import type { LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, compact, num } from "@/lib/format";

const G = "#00cc44";
const R = "#e60000";
const B = "#0044ff";

const ohlc = (v: number) => (v > 0 ? npr(v) : "—");
const bg = (chg: number) =>
  chg > 0 ? `rgba(0,204,68,0.08)` : chg < 0 ? `rgba(230,0,0,0.08)` : `rgba(0,68,255,0.06)`;
const fg = (chg: number) => (chg > 0 ? G : chg < 0 ? R : B);

export default function MarketPanel({
  liveData,
  noOuterBorder,
  mounted,
  compact: isCompact,
}: {
  liveData: LiveMarketData[] | undefined;
  noOuterBorder?: boolean;
  mounted?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<
    "percentageChange" | "symbol" | "lastTradedPrice" | "totalTradeQuantity"
  >("symbol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<"ALL" | "EQ" | "MF">("ALL");
  const [search, setSearch] = useState("");

  const setSorting = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const rows = useMemo(() => {
    if (!liveData) return [];
    const list = liveData.filter((r) => {
      if (/\d/.test(r.symbol)) return false;
      const sType = classifySymbol(r.symbol, r.securityName);
      if (sType === "DB") return false;
      if (filter !== "ALL" && sType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.symbol.toLowerCase().includes(q) &&
          !(r.securityName ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string")
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [liveData, sortKey, sortDir, filter, search]);

  const displayed = expanded ? rows : rows.slice(0, isCompact ? 5 : 25);

  const arrow = (k: typeof sortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <section
      className={
        noOuterBorder
          ? ""
          : "rounded-xl border border-border bg-surface shadow-sm overflow-hidden"
      }
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 sm:px-5 py-2 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-base font-bold text-foreground">
            Live Market
          </h2>
          <span className="text-[10px] sm:text-xs text-muted font-medium">
            {mounted ? `${rows.length} stocks` : "..."}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="hidden items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-[11px] font-semibold sm:flex">
            {(["ALL", "EQ", "MF"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded px-2.5 py-1 transition ${
                  filter === t
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-24 sm:w-36 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 sm:w-44"
          />
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-surface-2/80 whitespace-nowrap border border-border/50"
          >
            {expanded
              ? "▲ Less"
              : mounted
              ? `▼ All (${rows.length})`
              : "All"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] sm:text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th
                onClick={() => setSorting("symbol")}
                className="cursor-pointer px-2 sm:px-3 py-2 text-left font-bold hover:text-foreground"
              >
                Symbol{arrow("symbol")}
              </th>
              <th className="hidden sm:table-cell px-3 py-2 text-left font-bold">
                Type
              </th>
              <th className="hidden lg:table-cell px-3 py-2 text-left font-bold">
                Company
              </th>
              <th
                onClick={() => setSorting("lastTradedPrice")}
                className="cursor-pointer px-2 sm:px-3 py-2 text-right font-bold hover:text-foreground"
              >
                LTP{arrow("lastTradedPrice")}
              </th>
              <th
                onClick={() => setSorting("percentageChange")}
                className="cursor-pointer px-2 sm:px-3 py-2 text-right font-bold hover:text-foreground"
              >
                % Chg{arrow("percentageChange")}
              </th>
              <th className="hidden sm:table-cell px-3 py-2 text-right font-bold">
                Open
              </th>
              <th className="hidden md:table-cell px-3 py-2 text-right font-bold">
                High
              </th>
              <th className="hidden md:table-cell px-3 py-2 text-right font-bold">
                Low
              </th>
              <th className="px-2 sm:px-3 py-2 text-right font-bold">Vol</th>
              <th className="hidden sm:table-cell px-3 py-2 text-right font-bold">
                Turnover
              </th>
            </tr>
          </thead>
          <tbody>
            {!mounted && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  Loading market data...
                </td>
              </tr>
            )}
            {mounted &&
              displayed.map((r) => {
                const chg = r.percentageChange;
                const sType = classifySymbol(r.symbol, r.securityName);
                return (
                  <tr
                    key={r.symbol}
                    className="border-t border-border/40 transition hover:brightness-95"
                    style={{ background: bg(chg) }}
                  >
                    <td className="px-2 sm:px-3 py-2">
                      <Link
                        href={`/stock/${r.symbol}`}
                        className="font-bold text-foreground hover:underline text-[11px] sm:text-sm"
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_BADGE[sType]}`}
                      >
                        {sType}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell max-w-[200px] truncate px-3 py-2 text-foreground text-[11px]">
                      {r.securityName}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right font-semibold tabular-nums text-foreground text-[11px] sm:text-sm">
                      {npr(r.lastTradedPrice)}
                    </td>
                    <td
                      className="px-2 sm:px-3 py-2 text-right font-black tabular-nums text-[11px] sm:text-sm"
                      style={{ color: fg(chg) }}
                    >
                      {pct(chg)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-right tabular-nums text-muted text-[11px]">
                      {ohlc(r.openPrice)}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-muted text-[11px]">
                      {ohlc(r.highPrice)}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-muted text-[11px]">
                      {ohlc(r.lowPrice)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-muted text-[11px] sm:text-sm">
                      {num(r.totalTradeQuantity)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-right tabular-nums text-muted text-[11px]">
                      {compact(r.totalTradeValue)}
                    </td>
                  </tr>
                );
              })}
            {mounted && liveData && displayed.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
