"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus, SymbolType } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, num, compact, pct, changeClass } from "@/lib/format";

type LiveResp = { data: LiveMarketData[]; count: number };

type SortKey =
  | "symbol"
  | "lastTradedPrice"
  | "percentageChange"
  | "openPrice"
  | "highPrice"
  | "lowPrice"
  | "totalTradeQuantity"
  | "totalTradeValue";

export default function MarketPage() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  // Poll fast (5s) while open, slow (60s) when closed.
  const { data, error, loading, updatedAt } = usePoll<LiveResp>(
    "/api/live",
    open ? 5_000 : 60_000,
  );

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | SymbolType>("ALL");
  // Default: top % change first (biggest movers at the top).
  const [sort, setSort] = useState<SortKey>("percentageChange");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    const filtered = list.filter((r) => {
      const matchQ =
        !q ||
        r.symbol.toLowerCase().includes(q.toLowerCase()) ||
        r.securityName.toLowerCase().includes(q.toLowerCase());
      const sType = classifySymbol(r.symbol, r.securityName);
      const matchType = typeFilter === "ALL" || sType === typeFilter;
      return matchQ && matchType;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "string" || typeof bv === "string") {
        return dir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [data, q, sort, dir]);

  const setSorting = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const arrow = (k: SortKey) => (sort === k ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Market Watch</h1>
          <p className="text-sm text-muted">
            {data ? `${rows.length} / ${data.count} companies` : "Loading…"}
            {updatedAt && (
              <> · updated {new Date(updatedAt).toLocaleTimeString("en-GB")}</>
            )}
            {open ? " · auto-refresh 5s" : " · market closed"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Type filter buttons */}
          <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
            {(["ALL", "EQ", "DB", "MF", "PS"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-md px-2.5 py-1 transition ${
                  typeFilter === t ? "bg-primary text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol or company…"
            className="w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-down-bg px-4 py-3 text-sm text-down">
          Data error: {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <Th onClick={() => setSorting("symbol")}>Symbol{arrow("symbol")}</Th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Company</th>
              <Th right onClick={() => setSorting("lastTradedPrice")}>
                LTP{arrow("lastTradedPrice")}
              </Th>
              <Th right onClick={() => setSorting("percentageChange")}>
                % Chg{arrow("percentageChange")}
              </Th>
              <Th right onClick={() => setSorting("openPrice")}>Open{arrow("openPrice")}</Th>
              <Th right onClick={() => setSorting("highPrice")}>High{arrow("highPrice")}</Th>
              <Th right onClick={() => setSorting("lowPrice")}>Low{arrow("lowPrice")}</Th>
              <Th right onClick={() => setSorting("totalTradeQuantity")}>
                Volume{arrow("totalTradeQuantity")}
              </Th>
              <Th right onClick={() => setSorting("totalTradeValue")}>
                Turnover{arrow("totalTradeValue")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted">
                  Loading live market…
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const symbolLabel = r.symbol.replace(/\d+/g, "");
              return (
                <tr
                  key={r.symbol}
                  className="border-t border-border hover:bg-surface-2"
                >
                  <td className="px-3 py-2 font-bold">
                    <Link href={`/stock/${r.symbol}`} className="text-primary hover:underline">
                      {symbolLabel}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <TypeBadge symbol={r.symbol} securityName={r.securityName} />
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted">
                    {r.securityName}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {npr(r.lastTradedPrice)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${changeClass(
                      r.percentageChange,
                    )}`}
                  >
                    {pct(r.percentageChange)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{npr(r.openPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-up">{npr(r.highPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-down">{npr(r.lowPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.totalTradeQuantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{compact(r.totalTradeValue)}</td>
                </tr>
              );
            })}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted">
                  No match for "{q}"{typeFilter !== "ALL" ? ` (type: ${typeFilter})` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  right,
  onClick,
}: {
  children: React.ReactNode;
  right?: boolean;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2 font-semibold hover:text-primary ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TypeBadge({ symbol, securityName }: { symbol: string; securityName?: string }) {
  const t = classifySymbol(symbol, securityName);
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[t]}`}>
      {t}
    </span>
  );
}
