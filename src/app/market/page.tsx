"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus } from "@/lib/types";
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
  // Default: top % change first (biggest movers at the top).
  const [sort, setSort] = useState<SortKey>("percentageChange");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    const filtered = q
      ? list.filter(
          (r) =>
            r.symbol.toLowerCase().includes(q.toLowerCase()) ||
            r.securityName.toLowerCase().includes(q.toLowerCase()),
        )
      : list;
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
            {data ? `${data.count} companies` : "Loading…"}
            {updatedAt && (
              <> · updated {new Date(updatedAt).toLocaleTimeString("en-GB")}</>
            )}
            {open ? " · auto-refresh 5s" : " · market closed"}
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol or company…"
          className="w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
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
                <td colSpan={9} className="px-3 py-10 text-center text-muted">
                  Loading live market…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.symbol}
                className="border-t border-border hover:bg-surface-2"
              >
                <td className="px-3 py-2 font-bold">
                  <Link href={`/stock/${r.symbol}`} className="text-primary hover:underline">
                    {r.symbol}
                  </Link>
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
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted">
                  No match for “{q}”.
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
