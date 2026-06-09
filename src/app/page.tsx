"use client";
import { useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, NepseIndex, NepseSubIndex, TopTenItem } from "@/lib/types";
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

function chgOf(g: TopTenItem): number {
  const x = g as TopTenItem & { percentageChange?: number };
  return x.percentChange ?? x.percentageChange ?? 0;
}

export default function Dashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = open ? 10_000 : 60_000;
  const indices = usePoll<IndicesResp>("/api/indices", interval);
  const movers = usePoll<MoversResp>("/api/movers", interval);
  const signals = usePoll<SignalsResp>("/api/signals", open ? 5 * 60_000 : 10 * 60_000);

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

      {/* Index cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {nepse && (
          <IndexCard name="NEPSE" value={nepse.currentValue ?? nepse.close} change={nepse.change} perChange={nepse.perChange} big />
        )}
        {(indices.data?.subIndices ?? []).slice(0, 7).map((s) => (
          <IndexCard key={s.id} name={s.index.replace(" Index", "")} value={s.currentValue} change={s.change} perChange={s.perChange} />
        ))}
        {!indices.data && Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface-2" />)}
      </div>

      {/* Movers — compact, above AI signals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverCard title="Top Gainers" tone="up" rows={movers.data?.gainers ?? []} />
        <MoverCard title="Top Losers" tone="down" rows={movers.data?.losers ?? []} />
      </div>

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
                <th className="px-3 py-2 text-left">Signal</th>
                <th className="px-3 py-2 text-left">Confidence</th>
                <th className="px-3 py-2 text-right">LTP</th>
                <th className="px-3 py-2 text-right">% Chg</th>
                <th className="px-3 py-2 text-right">Buy Zone</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-center">Broker</th>
              </tr>
            </thead>
            <tbody>
              {signals.loading && !signals.data && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted">
                    Scanning active stocks…
                  </td>
                </tr>
              )}
              {shown.map((s) => {
                const isBuy = s.recommendation.includes("Buy");
                const isSell = s.recommendation.includes("Sell");
                const col = isBuy ? "var(--up)" : isSell ? "var(--down)" : "var(--muted)";
                return (
                  <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                    <td className="px-3 py-1.5">
                      <Link href={`/stock/${s.symbol}`} className="font-bold text-primary hover:underline">
                        {s.symbol}
                      </Link>
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
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full" style={{ width: `${s.confidence}%`, background: col }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted">{s.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{npr(s.ltp)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${changeClass(s.change)}`}>{pct(s.change)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-up">
                      {s.buyZone ? `${npr(s.buyZone[0])}-${npr(s.buyZone[1])}` : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-up">{npr(s.target1)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-down">{npr(s.stopLoss)}</td>
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
                  <td colSpan={9} className="px-3 py-6 text-center text-muted">
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
                <th className="px-3 py-2 text-center">Signal</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-right">TP1</th>
                <th className="px-3 py-2 text-right">Conf</th>
              </tr>
            </thead>
            <tbody>
              {signals.loading && !signals.data && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Scanning…</td></tr>
              )}
              {breakouts.map((s) => (
                <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                  <td className="px-3 py-1.5">
                    <Link href={`/stock/${s.symbol}`} className="font-bold text-primary hover:underline">{s.symbol}</Link>
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
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No breakouts right now (market may be closed).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function IndexCard({ name, value, change, perChange, big }: { name: string; value: number; change: number; perChange: number; big?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 shadow-sm ${big ? "ring-2 ring-primary/30" : ""}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</div>
      <div className={`mt-1 font-extrabold tabular-nums ${big ? "text-2xl" : "text-lg"}`}>{npr(value)}</div>
      <div className={`text-sm font-semibold tabular-nums ${changeClass(change)}`}>
        {change > 0 ? "+" : ""}
        {npr(change)} ({pct(perChange)})
      </div>
    </div>
  );
}

function MoverCard({ title, tone, rows }: { title: string; tone: "up" | "down"; rows: TopTenItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-bold">
        <span>{title}</span>
        <span className={tone === "up" ? "text-up" : "text-down"}>{tone === "up" ? "▲" : "▼"}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 && <div className="px-3 py-5 text-center text-xs text-muted">Loading…</div>}
        {rows.slice(0, 6).map((r) => (
          <Link
            key={r.symbol}
            href={`/stock/${r.symbol}`}
            className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <span className="truncate font-semibold text-primary">{r.symbol}</span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              <span className="text-muted">{npr(r.ltp)}</span>
              <span className={`font-semibold ${tone === "up" ? "text-up" : "text-down"}`}>{pct(chgOf(r))}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
