"use client";
import { useMemo } from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus, NepseIndex, NepseSubIndex } from "@/lib/types";
import { npr, compact, num, pct } from "@/lib/format";

type LiveResp = { data: LiveMarketData[]; count: number };
type IndicesResp = { index: NepseIndex[]; subIndices: NepseSubIndex[] };

// Sticky top summary bar: NEPSE index, daily change %, turnover, volume,
// market status and overall market mood (advancers vs decliners).
export default function SummaryBar() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = open ? 8_000 : 60_000;
  const indices = usePoll<IndicesResp>("/api/indices", interval);
  const live = usePoll<LiveResp>("/api/live", interval);

  const nepse =
    indices.data?.index?.find((i) => i.index === "NEPSE Index") ?? indices.data?.index?.[0];

  const agg = useMemo(() => {
    const list = live.data?.data ?? [];
    let turnover = 0;
    let volume = 0;
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const r of list) {
      turnover += r.totalTradeValue ?? 0;
      volume += r.totalTradeQuantity ?? 0;
      if (r.percentageChange > 0) up++;
      else if (r.percentageChange < 0) down++;
      else flat++;
    }
    const total = up + down || 1;
    const bullPct = (up / total) * 100;
    const mood =
      up === 0 && down === 0
        ? "—"
        : bullPct >= 60
          ? "Bullish"
          : bullPct <= 40
            ? "Bearish"
            : "Neutral";
    return { turnover, volume, up, down, flat, mood, bullPct };
  }, [live.data]);

  const moodTone =
    agg.mood === "Bullish" ? "up" : agg.mood === "Bearish" ? "down" : "muted";

  return (
    <div className="sticky top-[57px] z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-stretch gap-x-6 gap-y-2 px-4 py-2 text-sm">
        <Item label="NEPSE Index">
          <span className="font-bold tabular-nums">{npr(nepse?.currentValue ?? nepse?.close)}</span>
        </Item>
        <Item label="Daily Change">
          <span
            className={`font-bold tabular-nums ${
              (nepse?.change ?? 0) > 0
                ? "text-up"
                : (nepse?.change ?? 0) < 0
                  ? "text-down"
                  : "text-muted"
            }`}
          >
            {nepse ? `${nepse.change > 0 ? "+" : ""}${npr(nepse.change)} (${pct(nepse.perChange)})` : "—"}
          </span>
        </Item>
        <Item label="Turnover">
          <span className="font-bold tabular-nums">Rs {compact(agg.turnover)}</span>
        </Item>
        <Item label="Volume">
          <span className="font-bold tabular-nums">{num(agg.volume)}</span>
        </Item>
        <Item label="Status">
          <span className="inline-flex items-center gap-1 font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                open ? "bg-up animate-pulse" : "bg-down"
              }`}
            />
            {status.data ? (open ? "Open" : "Closed") : "…"}
          </span>
        </Item>
        <Item label="Market Mood">
          <span
            className={`font-bold ${
              moodTone === "up" ? "text-up" : moodTone === "down" ? "text-down" : "text-muted"
            }`}
          >
            {agg.mood}
            {agg.up + agg.down > 0 && (
              <span className="ml-1 font-normal text-muted">
                ▲{agg.up} ▼{agg.down}
              </span>
            )}
          </span>
        </Item>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
