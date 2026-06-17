"use client";
import { useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, NepseIndex, NepseSubIndex, TopTenItem } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, changeClass } from "@/lib/format";

type IndicesResp = { index: NepseIndex[]; subIndices: NepseSubIndex[] };
type MoversResp = { gainers: TopTenItem[]; losers: TopTenItem[] };
type SignalRow = {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  recommendation: string;
  confidence: number;
  buyZone: [number, number] | null;
  target1: number | null;
  stopLoss: number | null;
  trend: string | null;
  rsi: number | null;
  atr: number | null;
  atrStopLoss: number | null;
  sar: { sar: number; trend: "up" | "down"; bullish: boolean } | null;
  tmaSignal: "golden" | "death" | "bullish" | "bearish" | null;
  tmaValue: number | null;
  sma50: number | null;
  ema20: number | null;
  securityName?: string;
  breakout?: {
    signal: "BUY" | "SELL" | "WAIT";
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    confidence: number;
  };
  broker?: {
    buyerId: string;
    buyerNet: number;
    sellerId: string;
    sellerNet: number;
    bias: "accumulate" | "distribute" | "neutral";
  } | null;
};
type SignalsResp = { signals: SignalRow[]; generatedAt: number };
type NewsResp = { news: { id: string; title: string; source: string; url: string; time: string }[]; updatedAt: number };

function chgOf(g: TopTenItem): number {
  // The upstream API actually returns `percentageChange`; the TS type says
  // `percentChange`. Handle both so we never show 0% in movers.
  const x = g as TopTenItem & { percentageChange?: number };
  return x.percentChange ?? x.percentageChange ?? 0;
}

function ltpOf(g: TopTenItem): number {
  // Upstream returns `ltp` but fall back to `cp` (closing price) if absent.
  const x = g as TopTenItem & { lastTradedPrice?: number };
  return x.ltp ?? x.lastTradedPrice ?? x.cp ?? 0;
}

export default function Dashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = open ? 2_000 : 30_000;
  const indices = usePoll<IndicesResp>("/api/indices", interval);
  const movers = usePoll<MoversResp>("/api/movers", interval);
  const signals = usePoll<SignalsResp>("/api/signals", open ? 5 * 60_000 : 10 * 60_000);
  const news = usePoll<NewsResp>("/api/news", 3_000);

  const nepse =
    indices.data?.index?.find((i) => i.index === "NEPSE Index") ?? indices.data?.index?.[0];

  const [sigFilter, setSigFilter] = useState<"all" | "buy" | "sell">("all");
  const allSignals = signals.data?.signals ?? [];
  const shown = allSignals.filter((s) =>
    sigFilter === "all"
      ? true
      : sigFilter === "buy"
        ? s.recommendation.includes("Buy")
        : s.recommendation.includes("Sell"),
  );
  const buyCount = allSignals.filter((s) => s.recommendation.includes("Buy")).length;
  const sellCount = allSignals.filter((s) => s.recommendation.includes("Sell")).length;
  const breakouts = allSignals.filter((s) => s.breakout && s.breakout.signal !== "WAIT");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-foreground">DARI SIR</h1>
          <p className="text-sm text-muted">Nepal Stock Exchange — live dashboard</p>
        </div>
        <Link
          href="/market"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Market Watch →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {nepse && (
          <IndexCard name="NEPSE" value={nepse.currentValue ?? nepse.close} change={nepse.change} perChange={nepse.perChange} />
        )}
        {(indices.data?.subIndices ?? []).slice(0, 11).map((s) => (
          <IndexCard key={s.id} name={s.index.replace(" Index", "")} value={s.currentValue} change={s.change} perChange={s.perChange} />
        ))}
        {!indices.data && Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface-2" />)}
      </div>

      {/* Movers — compact, above AI signals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverCard title="Top Gainers" tone="up" rows={movers.data?.gainers ?? []} />
        <MoverCard title="Top Losers" tone="down" rows={movers.data?.losers ?? []} />
      </div>

      {/* News ticker */}
      <NewsSection news={news.data?.news ?? []} loading={news.loading && !news.data} />

      {/* Top AI Signals — compact table */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-bold">🎯 Top AI Signals</h2>
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
            {([
              ["all", `All ${allSignals.length || ""}`],
              ["buy", `Buy ${buyCount || ""}`],
              ["sell", `Sell ${sellCount || ""}`],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSigFilter(k)}
                className={`rounded-md px-3 py-1 transition ${
                  sigFilter === k ? "bg-primary text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {signals.error && <div className="px-4 py-3 text-sm text-down">Error: {signals.error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Signal</th>
                <th className="px-3 py-2 text-left">Conf</th>
                <th className="px-3 py-2 text-right">LTP</th>
                <th className="px-3 py-2 text-right">% Chg</th>
                <th className="px-3 py-2 text-center">RSI</th>
                <th className="px-3 py-2 text-center">SAR</th>
                <th className="px-3 py-2 text-center">TMA</th>
                <th className="px-3 py-2 text-right">ATR SL</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2 text-center">Broker</th>
              </tr>
            </thead>
            <tbody>
              {signals.loading && !signals.data && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted">
                    Scanning active stocks…
                  </td>
                </tr>
              )}
              {shown.map((s) => {
                const isBuy = s.recommendation.includes("Buy");
                const isSell = s.recommendation.includes("Sell");
                const col = isBuy ? "var(--up)" : isSell ? "var(--down)" : "var(--muted)";
                const sType = classifySymbol(s.symbol, s.name);
                const rsiColor =
                  s.rsi === null ? "text-muted"
                  : s.rsi < 30 ? "text-up font-bold"
                  : s.rsi > 70 ? "text-down font-bold"
                  : s.rsi > 55 ? "text-up"
                  : s.rsi < 45 ? "text-down"
                  : "text-muted";
                return (
                  <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                    <td className="px-3 py-1.5">
                      <Link href={`/stock/${s.symbol}`} className="font-bold text-primary hover:underline">
                        {s.symbol}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[sType]}`}>
                        {sType}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          isBuy ? "bg-up-bg text-up" : isSell ? "bg-down-bg text-down" : "bg-surface text-muted"
                        }`}
                      >
                        {s.recommendation}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full" style={{ width: `${s.confidence}%`, background: col }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted">{s.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{npr(s.ltp)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${changeClass(s.change)}`}>{pct(s.change)}</td>
                    <td className={`px-3 py-1.5 text-center text-xs tabular-nums ${rsiColor}`}>
                      {s.rsi !== null ? s.rsi.toFixed(0) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center text-xs font-semibold">
                      {s.sar ? (
                        <span className={s.sar.bullish ? "text-up" : "text-down"}>
                          {s.sar.bullish ? "▼ Bull" : "▲ Bear"}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center text-xs font-semibold">
                      {s.tmaSignal ? (
                        <span className={
                          s.tmaSignal === "golden" ? "text-up font-extrabold"
                          : s.tmaSignal === "death" ? "text-down font-extrabold"
                          : s.tmaSignal === "bullish" ? "text-up"
                          : "text-down"
                        }>
                          {s.tmaSignal === "golden" ? "⭐ Golden"
                            : s.tmaSignal === "death" ? "💀 Death"
                            : s.tmaSignal === "bullish" ? "▲ Bull"
                            : "▼ Bear"}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-down text-xs">
                      {s.atrStopLoss !== null ? npr(s.atrStopLoss) : s.stopLoss !== null ? npr(s.stopLoss) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-up text-xs">{npr(s.target1)}</td>
                    <td className="px-3 py-1.5 text-center text-xs font-semibold">
                      {s.broker?.bias === "accumulate" ? (
                        <span className="text-up">🟢 #{s.broker.buyerId}</span>
                      ) : s.broker?.bias === "distribute" ? (
                        <span className="text-down">🔴 #{s.broker.sellerId}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {signals.data && shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-muted">
                    No {sigFilter === "all" ? "" : sigFilter} signals right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Breakout Signals (daily) — compact */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-bold">⚡ Breakout Signals</h2>
          <span className="text-xs text-muted">price breaks prev high/low + volume</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-center">Signal</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-right">TP1</th>
                <th className="px-3 py-2 text-right">Conf</th>
              </tr>
            </thead>
            <tbody>
              {signals.loading && !signals.data && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">Scanning…</td></tr>
              )}
              {breakouts.map((s) => (
                <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                  <td className="px-3 py-1.5">
                    <Link href={`/stock/${s.symbol}`} className="font-bold text-primary hover:underline">{s.symbol}</Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[classifySymbol(s.symbol, s.name)]}`}>
                      {classifySymbol(s.symbol, s.name)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${s.breakout!.signal === "BUY" ? "bg-up text-white" : "bg-down text-white"}`}>
                      {s.breakout!.signal}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{npr(s.breakout!.entry)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-down">{npr(s.breakout!.sl)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-up">{npr(s.breakout!.tp1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{s.breakout!.confidence}%</td>
                </tr>
              ))}
              {signals.data && breakouts.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No breakouts right now (market may be closed).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function IndexCard({ name, value, change, perChange }: { name: string; value: number; change: number; perChange: number; }) {
  const positive = change >= 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-sm">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">{name}</div>
      <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">{npr(value)}</div>
      <div className={`text-[11px] font-semibold tabular-nums ${changeClass(change)}`}>
        {positive ? "+" : ""}{npr(change)} ({pct(perChange)})
      </div>
    </div>
  );
}

function NewsSection({ news, loading }: { news: NewsResp["news"]; loading: boolean }) {
  const sources = Array.from(new Set(news.map((n) => n.source)));
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? news : news.filter((n) => n.source === filter);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-bold">📰 Market News</h2>
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-md px-2.5 py-1 transition ${filter === "all" ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`}
          >
            All
          </button>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 transition ${filter === s ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-64 overflow-auto">
        {loading && (
          <div className="px-4 py-6 text-center text-sm text-muted">Loading market news…</div>
        )}
        <div className="divide-y divide-border">
          {filtered.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-3 px-4 py-2 text-sm hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="font-medium text-foreground">{n.title}</span>
                <span className="ml-2 text-[10px] font-semibold text-muted">{n.source}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted">
                {new Date(n.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function MoverCard({ title, tone, rows }: { title: string; tone: "up" | "down"; rows: TopTenItem[] }) {
  const chgClass = tone === "up" ? "text-up" : "text-down";
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-bold">
        <span>{title}</span>
        <span className={chgClass}>{tone === "up" ? "▲" : "▼"}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-muted">No data — market may be closed</div>
        )}
        {rows.slice(0, 10).map((r) => {
          const chg = chgOf(r);
          const ltp = ltpOf(r);
          const sType = classifySymbol(r.symbol, r.securityName);
          return (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol}`}
              className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="font-bold text-primary">{r.symbol}</span>
                <span className={`hidden shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:inline-block ${TYPE_BADGE[sType]}`}>
                  {sType}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="text-muted">{npr(ltp)}</span>
                <span className={`w-14 text-right font-bold ${chgClass}`}>
                  {chg > 0 ? "+" : ""}{pct(chg)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
