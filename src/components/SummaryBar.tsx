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
  const status = usePoll<MarketStatus>("/api/market-status", 2_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = 2_000;
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
    <div className="sticky top-[78px] z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-x-5 gap-y-1 px-4 py-1.5 text-xs">
        <Item label="NEPSE">
          <span className="font-bold tabular-nums text-foreground">{npr(nepse?.currentValue ?? nepse?.close)}</span>
        </Item>
        <Item label="Change">
          <span className={`font-bold tabular-nums ${(nepse?.change ?? 0) > 0 ? "text-up" : (nepse?.change ?? 0) < 0 ? "text-down" : "text-muted"}`}>
            {nepse ? `${nepse.change > 0 ? "+" : ""}${npr(nepse.change)} (${pct(nepse.perChange)})` : "—"}
          </span>
        </Item>
        <Item label="Turnover">
          <span className="font-bold tabular-nums text-foreground">Rs {compact(agg.turnover)}</span>
        </Item>
        <Item label="Volume">
          <span className="font-bold tabular-nums text-foreground">{num(agg.volume)}</span>
        </Item>
        <Item label="Mood">
          <span className={`font-bold ${moodTone === "up" ? "text-up" : moodTone === "down" ? "text-down" : "text-muted"}`}>
            {agg.mood}
          </span>
        </Item>
        <div className="ml-auto hidden items-center gap-1 text-[10px] text-muted sm:flex">
          <span className="text-up">▲ {agg.up}</span>
          <span className="text-down">▼ {agg.down}</span>
          <span>— {agg.flat}</span>
        </div>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 leading-tight">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}
