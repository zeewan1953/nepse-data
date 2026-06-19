"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus, NepseIndex, NepseSubIndex, TopTenItem } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, changeClass, num } from "@/lib/format";
import { generateSignal, type Signal } from "@/lib/signals";
import { useAuth } from "@/lib/useAuth";

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
  sma200: number | null;
  ema20: number | null;
  macd: { macd: number; signal: number; hist: number } | null;
  securityName?: string;
  breakout?: {
    signal: "BUY" | "SELL" | "WAIT";
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    confidence: number;
  };
  instBreakout?: {
    structure: string;
    direction: "LONG" | "SHORT" | "NO TRADE";
    breakoutType: string | null;
    entryZone: [number, number] | null;
    breakoutLevel: number | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    rr: number | null;
    score: number;
    scores: {
      compression: number;
      liquidity: number;
      volume: number;
      momentum: number;
      htf: number;
      rrQuality: number;
    };
    hasSweep: boolean;
    hasTrap: boolean;
    isWick: boolean;
    reason: string;
    status: "VALID BREAKOUT" | "FAKE BREAKOUT (AVOID)";
  };
  institutional?: {
    regime: string;
    direction: "LONG" | "SHORT" | "NO TRADE";
    entryType: string | null;
    entryZone: [number, number] | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    rr: number | null;
    score: number;
    structureEvent: string | null;
    scores: {
      trendAlignment: number;
      structureQuality: number;
      liquidityEvent: number;
      momentum: number;
      volumeStrength: number;
      riskRewardQuality: number;
    };
    reasoning: string;
    tradeValid: "Valid" | "Invalid";
    invalidReason: string | null;
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

function UserGreeting() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-sm">
      <div className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: "#0F6E56" }}>
        {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-foreground">Welcome back, {user.name}</div>
        <div className="text-[11px] text-muted truncate">{user.email}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 2_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = 2_000;
  const indices = usePoll<IndicesResp>("/api/indices", interval);
  const movers = usePoll<MoversResp>("/api/movers", interval);
  const signals = usePoll<SignalsResp>("/api/signals", open ? 5 * 60_000 : 10 * 60_000);
  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);

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
  // Show all stocks with breakout analysis (both valid and fake — users see why rejected)
  const breakouts = allSignals
    .filter((s) => s.instBreakout && (s.instBreakout.direction !== "NO TRADE" || s.instBreakout.score > 0))
    .sort((a, b) => {
      // Valid breakouts first, then by score descending
      const aValid = a.instBreakout!.status === "VALID BREAKOUT" ? 1 : 0;
      const bValid = b.instBreakout!.status === "VALID BREAKOUT" ? 1 : 0;
      if (aValid !== bValid) return bValid - aValid;
      return b.instBreakout!.score - a.instBreakout!.score;
    });

  return (
    <div className="space-y-6">
      {/* User greeting bar */}
      <UserGreeting />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-black text-foreground">DARI SIR</h1>
          <p className="text-sm text-muted">Nepal Stock Exchange — live dashboard</p>
        </div>
      </div>

      {/* NEPSE Index Chart — below title */}
      <NepseIndexChart />

      {/* Two-column: Sector Indices + Paper Trading */}
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        {/* Left: Sector indices organized grid */}
        <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border px-3 py-1.5">
            <h2 className="text-xs font-bold text-foreground">Sector Indices</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
            {nepse && (
              <SectorCard name="NEPSE" value={(nepse as any).currentValue ?? (nepse as any).close} change={(nepse as any).change ?? 0} perChange={(nepse as any).perChange ?? 0} highlight />
            )}
            {(indices.data?.subIndices ?? []).slice(0, 11).map((s) => {
              const value = (s as any).currentValue ?? (s as any).close ?? 0;
              const change = (s as any).change ?? (s as any).points ?? 0;
              const perChange = (s as any).perChange ?? (s as any).percentage ?? 0;
              return <SectorCard key={s.index} name={s.index.replace(" Index", "").replace("SubIndex", "").trim()} value={value} change={change} perChange={perChange} />;
            })}
            {!indices.data && Array.from({ length: 12 }).map((_, i) => <div key={i} className="animate-pulse border-r border-t border-border p-2"><div className="h-2 w-12 rounded bg-surface-2" /><div className="mt-1 h-3 w-10 rounded bg-surface-2" /></div>)}
          </div>
        </div>

        {/* Right: Paper Trading section */}
        <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border px-3 py-1.5">
            <h2 className="text-xs font-bold text-foreground">Paper Trading</h2>
          </div>
          <div className="flex flex-col items-center px-3 py-3 text-center">
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(15,110,86,0.1)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <h3 className="mb-0.5 text-sm font-bold text-foreground">Demo Trading</h3>
            <p className="mb-2 text-[10px] text-muted">Virtual NPR 10,00,000 — real prices</p>
            <Link
              href="/demo"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
              style={{ background: "#0F6E56" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
              Open Demo
            </Link>
          </div>
        </div>
      </div>

      {/* Movers — compact, above AI signals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverCard title="Top Gainers" tone="up" rows={movers.data?.gainers ?? []} />
        <MoverCard title="Top Losers" tone="down" rows={movers.data?.losers ?? []} />
      </div>

      {/* News removed - available at /news via header nav */}

      {/* Top AI Signals — compact table */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-bold">🎯 Top Signals</h2>
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
                <th className="px-3 py-2 text-center">Regime</th>
                <th className="px-3 py-2 text-center">SMC</th>
                <th className="px-3 py-2 text-center">Dir</th>
                <th className="px-3 py-2 text-center">SMA 50</th>
                <th className="px-3 py-2 text-center">SMA 200</th>
                <th className="px-3 py-2 text-center">TMA/DMA</th>
                <th className="px-3 py-2 text-center">MACD</th>
                <th className="px-3 py-2 text-center">RSI</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-right">TP1</th>
                <th className="px-3 py-2 text-center">Broker</th>
              </tr>
            </thead>
            <tbody>
              {signals.loading && !signals.data && (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-muted">
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
                    <td className="px-3 py-1.5 text-center">
                      {s.institutional ? (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          s.institutional.regime === "Trending Bullish" ? "bg-up/10 text-up"
                          : s.institutional.regime === "Trending Bearish" ? "bg-down/10 text-down"
                          : s.institutional.regime === "High Volatility" ? "bg-amber-500/10 text-amber-600"
                          : "bg-surface text-muted"
                        }`}>
                          {s.institutional.regime === "Trending Bullish" ? "BULL"
                            : s.institutional.regime === "Trending Bearish" ? "BEAR"
                            : s.institutional.regime === "High Volatility" ? "H.VOL"
                            : "SIDE"}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.institutional ? (
                        <span className={`text-xs font-extrabold tabular-nums ${
                          s.institutional.score >= 88 ? "text-up"
                          : s.institutional.score >= 70 ? "text-amber-600"
                          : "text-muted"
                        }`}>
                          {s.institutional.score}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.institutional?.direction === "LONG" ? (
                        <span className="text-xs font-extrabold text-up">LONG</span>
                      ) : s.institutional?.direction === "SHORT" ? (
                        <span className="text-xs font-extrabold text-down">SHORT</span>
                      ) : (
                        <span className="text-[10px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.sma50 ? (
                        <span className={`text-xs font-bold tabular-nums ${s.ltp > s.sma50 ? "text-up" : "text-down"}`}>
                          {s.sma50.toFixed(0)}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.sma200 ? (
                        <span className={`text-xs font-bold tabular-nums ${s.ltp > s.sma200 ? "text-up" : "text-down"}`}>
                          {s.sma200.toFixed(0)}
                        </span>
                      ) : <span className="text-muted" title="Need 200+ candles">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.tmaSignal ? (
                        <span className={`text-[10px] font-extrabold ${
                          s.tmaSignal === "golden" ? "text-up" :
                          s.tmaSignal === "death" ? "text-down" :
                          s.tmaSignal === "bullish" ? "text-up" : "text-down"
                        }`}>
                          {s.tmaSignal === "golden" ? "⭐ GLD" :
                           s.tmaSignal === "death" ? "💀 DTH" :
                           s.tmaSignal === "bullish" ? "▲ BUL" : "▼ BER"}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.macd ? (
                        <span className={`text-xs font-bold tabular-nums ${s.macd.hist > 0 ? "text-up" : "text-down"}`}>
                          {s.macd.hist > 0 ? "+" : ""}{s.macd.hist.toFixed(1)}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className={`px-3 py-1.5 text-center text-xs tabular-nums ${rsiColor}`}>
                      {s.rsi !== null ? s.rsi.toFixed(0) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-down text-xs">
                      {s.institutional?.stopLoss !== null && s.institutional?.stopLoss
                        ? npr(s.institutional.stopLoss)
                        : s.atrStopLoss !== null ? npr(s.atrStopLoss) : s.stopLoss !== null ? npr(s.stopLoss) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-up text-xs">
                      {s.institutional?.tp1 !== null && s.institutional?.tp1
                        ? npr(s.institutional.tp1)
                        : npr(s.target1)}
                    </td>
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
                  <td colSpan={17} className="px-3 py-6 text-center text-muted">
                    No {sigFilter === "all" ? "" : sigFilter} signals right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Breakout Signals (daily) — Institutional SMC — Always Visible */}
      <section className="rounded-xl border-2 border-primary/30 bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold">⚡ Breakout Signals</h2>
            <span className="animate-pulse rounded bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">SMC ENGINE</span>
            <span className="rounded bg-up-bg px-1.5 py-0.5 text-[9px] font-bold text-up">{breakouts.filter(b => b.instBreakout?.status === "VALID BREAKOUT").length} VALID</span>
            <span className="rounded bg-down-bg px-1.5 py-0.5 text-[9px] font-bold text-down">{breakouts.filter(b => b.instBreakout?.status === "FAKE BREAKOUT (AVOID)").length} FAKE</span>
          </div>
          <span className="text-[10px] text-muted">liquidity-validated • score ≥ 90</span>
        </div>

        {signals.loading && !signals.data ? (
          <div className="px-4 py-8 text-center text-sm text-muted">Scanning market for breakouts…</div>
        ) : breakouts.length > 0 ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {breakouts.map((s) => {
              const ib = s.instBreakout!;
              const isValid = ib.status === "VALID BREAKOUT";
              const confPct = Math.min(ib.score, 100);
              const confColor = confPct >= 90 ? "#22c55e" : confPct >= 70 ? "#f59e0b" : "#6b7280";
              const circumference = 2 * Math.PI * 28;
              const dashOffset = circumference - (confPct / 100) * circumference;

              return (
                <div key={s.symbol} className={`relative rounded-xl border-2 p-3 transition hover:shadow-lg ${isValid ? "border-up/40 bg-up-bg/30" : "border-down/30 bg-down-bg/20 opacity-75"}`}>
                  {/* Top row: Symbol + Confidence ring */}
                  <div className="flex items-start justify-between">
                    <div>
                      <Link href={`/stock/${s.symbol}`} className="text-lg font-black text-primary hover:underline">{s.symbol}</Link>
                      <div className="text-xs text-muted">{npr(s.ltp)} <span className={`font-bold ${s.change >= 0 ? "text-up" : "text-down"}`}>{s.change >= 0 ? "+" : ""}{pct(s.change)}</span></div>
                    </div>
                    {/* Circular confidence gauge */}
                    <div className="relative h-16 w-16">
                      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
                        <circle cx="32" cy="32" r="28" fill="none" stroke={confColor} strokeWidth="4" strokeLinecap="round"
                          strokeDasharray={circumference} strokeDashoffset={dashOffset}
                          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-black tabular-nums" style={{ color: confColor }}>{confPct}%</span>
                        <span className="text-[7px] text-muted">CONF</span>
                      </div>
                    </div>
                  </div>

                  {/* Direction + Status badge */}
                  <div className="mt-2 flex items-center gap-2">
                    {ib.direction === "LONG" ? (
                      <span className="rounded-full bg-up px-2.5 py-0.5 text-[10px] font-extrabold text-white">🟢 LONG</span>
                    ) : ib.direction === "SHORT" ? (
                      <span className="rounded-full bg-down px-2.5 py-0.5 text-[10px] font-extrabold text-white">🔴 SHORT</span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-bold text-muted">NO TRADE</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${isValid ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
                      {isValid ? "✅ VALID" : "❌ FAKE"}
                    </span>
                    {/* Structure badge */}
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      ib.structure === "Compression" ? "bg-amber-500/10 text-amber-500"
                      : ib.structure === "Accumulation" ? "bg-up/10 text-up"
                      : ib.structure === "Distribution" ? "bg-down/10 text-down"
                      : ib.structure === "Trending" ? "bg-blue-400/10 text-blue-400"
                      : "bg-surface text-muted"
                    }`}>
                      {ib.structure === "Compression" ? "COMP" : ib.structure === "Accumulation" ? "ACCUM" : ib.structure === "Distribution" ? "DIST" : ib.structure === "Trending" ? "TREND" : "CHOP"}
                    </span>
                  </div>

                  {/* Entry / SL / TP levels */}
                  <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
                    <div className="rounded bg-surface-2 p-1">
                      <div className="text-[8px] text-muted">Entry</div>
                      <div className="font-bold tabular-nums text-foreground">{ib.entryZone ? `${npr(ib.entryZone[0])}` : "—"}</div>
                      {ib.entryZone && <div className="text-[7px] text-muted">to {npr(ib.entryZone[1])}</div>}
                    </div>
                    <div className="rounded bg-down-bg/50 p-1">
                      <div className="text-[8px] text-muted">SL</div>
                      <div className="font-bold tabular-nums text-down">{ib.stopLoss ? npr(ib.stopLoss) : "—"}</div>
                    </div>
                    <div className="rounded bg-up-bg/50 p-1">
                      <div className="text-[8px] text-muted">TP1</div>
                      <div className="font-bold tabular-nums text-up">{ib.tp1 ? npr(ib.tp1) : "—"}</div>
                    </div>
                    <div className="rounded bg-up-bg/30 p-1">
                      <div className="text-[8px] text-muted">TP2</div>
                      <div className="font-bold tabular-nums text-up">{ib.tp2 ? npr(ib.tp2) : "—"}</div>
                    </div>
                  </div>

                  {/* R:R + Score breakdown bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-[10px] font-bold">
                      R:R <span className={`tabular-nums ${ib.rr && ib.rr >= 3 ? "text-up" : ib.rr && ib.rr >= 2.5 ? "text-amber-500" : "text-down"}`}>1:{ib.rr ? ib.rr.toFixed(1) : "—"}</span>
                    </div>
                    {/* Mini score bars */}
                    <div className="flex flex-1 items-center gap-0.5">
                      {[
                        { label: "S", val: ib.scores.compression, max: 20 },
                        { label: "L", val: ib.scores.liquidity, max: 20 },
                        { label: "V", val: ib.scores.volume, max: 20 },
                        { label: "M", val: ib.scores.momentum, max: 15 },
                        { label: "H", val: ib.scores.htf, max: 15 },
                        { label: "R", val: ib.scores.rrQuality, max: 10 },
                      ].map((item) => {
                        const pctFill = (item.val / item.max) * 100;
                        const barColor = pctFill >= 75 ? "bg-up" : pctFill >= 50 ? "bg-amber-500" : "bg-border";
                        return (
                          <div key={item.label} className="flex flex-1 flex-col items-center gap-0.5" title={`${item.label}: ${item.val}/${item.max}`}>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pctFill}%` }} />
                            </div>
                            <span className="text-[7px] text-muted">{item.label}{item.val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SMC Flags + Reason */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {ib.hasSweep && <span title="Liquidity Sweep" className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px]">💧 Sweep</span>}
                    {ib.hasTrap && <span title="False Trap" className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px]">🪤 Trap</span>}
                    {ib.isWick && <span title="Wick Breakout" className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px]">🕯 Wick</span>}
                    {ib.breakoutType && <span className={`text-[9px] font-semibold ${ib.breakoutType === "Clean Breakout" ? "text-up" : ib.breakoutType === "Breakout + Retest" ? "text-blue-400" : "text-amber-500"}`}>{ib.breakoutType}</span>}
                  </div>
                  {ib.reason && <div className="mt-1 truncate text-[9px] text-muted" title={ib.reason}>{ib.reason}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <div className="text-lg">⏳</div>
            <div className="text-xs text-muted">No institutional breakouts detected</div>
            <div className="text-[10px] text-muted">Market may be consolidating — waiting for score ≥ 90</div>
          </div>
        )}

        {/* Score legend */}
        <div className="border-t border-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted">
            <span className="font-bold">Score:</span>
            <span>S=Structure /20</span>
            <span>L=Liquidity /20</span>
            <span>V=Volume /20</span>
            <span>M=Momentum /15</span>
            <span>H=HTF /15</span>
            <span>R=R:R /10</span>
            <span className="ml-2">💧=Sweep</span>
            <span>🪤=Trap</span>
            <span>🕯=Wick</span>
          </div>
        </div>
      </section>

      {/* Demo Trading section removed - now in sidebar above */}
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

function SectorCard({ name, value, change, perChange, highlight }: { name: string; value: number; change: number; perChange: number; highlight?: boolean }) {
  const positive = change >= 0;
  return (
    <div className={`border-r border-t border-border px-2 py-1.5 transition hover:bg-surface-2 ${highlight ? "bg-primary/5" : ""}`}>
      <div className={`truncate text-[9px] font-medium uppercase tracking-wide ${highlight ? "text-primary font-bold" : "text-muted"}`}>{name}</div>
      <div className="text-[11px] font-extrabold tabular-nums text-foreground">{npr(value)}</div>
      <span className={`text-[9px] font-semibold tabular-nums ${changeClass(change)}`}>
        {positive ? "+" : ""}{pct(perChange)}
      </span>
    </div>
  );
}

/* NewsSection removed — available at /news */

/* ─── NEPSE Index Chart (TradingView lightweight-charts + real NEPSE data) ─── */
const r2 = (n: number) => Math.round(n * 100) / 100;
type CBar = CandlestickData<Time>;
type CVol = HistogramData<Time>;

function aggregateToOHLC(points: [number, number][], intervalMin = 5): { bars: CBar[]; vols: CVol[] } {
  const intervalSec = intervalMin * 60;
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();
  for (const [t, v] of points) {
    if (t <= 0 || v <= 0) continue;
    const b = Math.floor(t / intervalSec) * intervalSec;
    const cur = buckets.get(b);
    if (!cur) buckets.set(b, { o: v, h: v, l: v, c: v, v: 1 });
    else { cur.h = Math.max(cur.h, v); cur.l = Math.min(cur.l, v); cur.c = v; cur.v++; }
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const bars: CBar[] = sorted.map(([t, d]) => ({ time: t as Time, open: r2(d.o), high: r2(d.h), low: r2(d.l), close: r2(d.c) }));
  const vols: CVol[] = sorted.map(([t, d]) => ({ time: t as Time, value: d.v, color: d.c >= d.o ? "#26a69a44" : "#ef535044" }));
  return { bars, vols };
}

function smaCalc(bars: CBar[], period: number): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bars[i].time, value: r2(sum / period) });
  }
  return out;
}

function NepseIndexChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headerInfo, setHeaderInfo] = useState<{ value: number; change: number; pct: number } | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#666", fontSize: 11 },
      grid: { vertLines: { color: "rgba(0,0,0,0.04)" }, horzLines: { color: "rgba(0,0,0,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.08)" },
      timeScale: { borderColor: "rgba(0,0,0,0.08)", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    candleRef.current = candles;

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // MA20 overlay
    const maSeries = chart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    // OHLC legend
    const updateLegend = (bar?: CBar) => {
      const el = legendRef.current;
      if (!el) return;
      const b = bar ?? (chartRef.current as any)?._lastBar;
      if (!b) { el.innerHTML = ""; return; }
      const up = b.close >= b.open;
      const col = up ? "#26a69a" : "#ef5350";
      el.innerHTML = `O <b style="color:${col}">${b.open}</b> H <b style="color:${col}">${b.high}</b> L <b style="color:${col}">${b.low}</b> C <b style="color:${col}">${b.close}</b>`;
    };
    chart.subscribeCrosshairMove((p) => updateLegend(p.seriesData.get(candles) as CBar | undefined));

    const fetchData = async () => {
      try {
        const res = await fetch("/api/index-graph", { cache: "no-store" });
        const json = await res.json();
        const points = json.points;
        const src = json.source;
        if (!Array.isArray(points) || points.length < 2) {
          setError("No NEPSE data — market may be closed");
          setLoading(false);
          return;
        }
        setIsSimulated(src === "synthetic");
        const valid = points.filter((p: any) => Array.isArray(p) && p.length >= 2 && p[0] > 0 && p[1] > 0);
        if (valid.length < 2) { setError("Insufficient data"); setLoading(false); return; }

        const { bars, vols } = aggregateToOHLC(valid as [number, number][], 5);
        if (!bars.length) { setError("No candles built"); setLoading(false); return; }

        candles.setData(bars);
        vol.setData(vols);
        maSeries.setData(smaCalc(bars, 20));
        chart.timeScale().fitContent();
        setError(null);
        (chartRef.current as any)._lastBar = bars[bars.length - 1];
        updateLegend(bars[bars.length - 1]);

        const last = bars[bars.length - 1];
        const first = bars[0];
        const ch = last.close - first.open;
        setHeaderInfo({ value: last.close, change: ch, pct: first.open > 0 ? (ch / first.open) * 100 : 0 });
        setLoading(false);
      } catch (e) { setError((e as Error).message); setLoading(false); }
    };

    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => { clearInterval(iv); chart.remove(); chartRef.current = null; candleRef.current = null; };
  }, []);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-foreground">📊 NEPSE Index</span>
          {headerInfo && (
            <>
              <span className="text-sm font-extrabold tabular-nums text-foreground">{r2(headerInfo.value)}</span>
              <span className={`text-xs font-bold tabular-nums ${headerInfo.change >= 0 ? "text-up" : "text-down"}`}>
                {headerInfo.change >= 0 ? "+" : ""}{r2(headerInfo.change)} ({pct(headerInfo.pct)})
              </span>
            </>
          )}
          <span ref={legendRef} className="hidden sm:inline text-[10px] tabular-nums text-muted" />
        </div>
        <div className="flex items-center gap-2">
          {isSimulated && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">SIMULATED</span>}
          {loading && <span className="text-[10px] text-muted animate-pulse">Loading...</span>}
          <Link href="/chart" className="text-[10px] font-semibold text-primary hover:underline">Full Chart →</Link>
        </div>
      </div>
      <div className="relative" style={{ height: 320 }}>
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80">
            <div className="text-center">
              <div className="text-lg">📈</div>
              <div className="text-xs text-muted">{error}</div>
              <div className="text-[10px] text-muted mt-1">Real NEPSE data — available during market hours</div>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
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

function StockSearch({ liveData }: { liveData: { data: LiveMarketData[]; count: number } | undefined }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    if (!q.trim() || !liveData?.data) return [];
    const query = q.toLowerCase();
    return liveData.data
      .filter((r) => r.symbol.toLowerCase().includes(query) || (r.securityName ?? "").toLowerCase().includes(query))
      .slice(0, 6);
  }, [q, liveData]);

  return (
    <div ref={ref} className="relative w-56 sm:w-64">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q.trim() && setOpen(true)}
          placeholder="Search stock..."
          className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary placeholder:text-muted"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.map((r) => {
            const sType = classifySymbol(r.symbol, r.securityName);
            return (
              <button
                key={r.symbol}
                onClick={() => { setOpen(false); setQ(""); setPopup(r.symbol); }}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-surface-2 text-left"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-primary">{r.symbol}</span>
                  <span className={`rounded px-1 py-0 text-[8px] font-bold uppercase ${TYPE_BADGE[sType]}`}>{sType}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
                  <span className="text-muted">{npr(r.lastTradedPrice)}</span>
                  <span className={`w-12 text-right font-bold ${r.percentageChange >= 0 ? "text-up" : "text-down"}`}>
                    {r.percentageChange >= 0 ? "+" : ""}{pct(r.percentageChange)}
                  </span>
                </span>
              </button>
            );
          })}
          <Link
            href={`/market?q=${encodeURIComponent(q)}`}
            onClick={() => { setOpen(false); setQ(""); }}
            className="block border-t border-border py-1.5 text-center text-[10px] font-semibold text-primary hover:bg-surface-2"
          >
            View all →
          </Link>
        </div>
      )}
      {popup && <StockPopup symbol={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

type FundData = {
  symbol: string; name: string; sector: string; eps: number; pe: number;
  bookValue: number; pbv: number; marketCap: string; weekRange: string;
  sharesOutstanding: string; netWorth: number; totalDebt: number;
  netProfit: number; revenue: number; roe: number; debtEquity: number;
  dividends: { fiscalYear: string; value: number }[];
  marketPrice: number; change: number; yearYield: string; avg120: string;
};
type SecData = {
  details: { securityDailyTradeDto?: { openPrice: number; highPrice: number; lowPrice: number; previousClose: number; lastTradedPrice: number; fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number; totalTradeQuantity: number; marketCap: number }; securityPriceVolumeDto?: { paidUpValue: number; totalPaidupCapital: string } } | null;
  history: { content: { businessDate: string; closePrice: number; highPrice: number; lowPrice: number; totalTradedQuantity: number }[] } | null;
};
type BrokerFlow = { buyerId: string; buyerNet: number; sellerId: string; sellerNet: number; bias: "accumulate" | "distribute" | "neutral" } | null;

const parseNumber = (s: string): number => { const n = Number(s.replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };

function StockPopup({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [fund, setFund] = useState<FundData | null>(null);
  const [sec, setSec] = useState<SecData | null>(null);
  const [signalRow, setSignalRow] = useState<SignalRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/fundamental-external/${encodeURIComponent(symbol)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/security/${encodeURIComponent(symbol)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/signals`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([f, s, sig]) => {
      setFund(f);
      setSec(s);
      const found = sig?.signals?.find((x: { symbol: string }) => x.symbol === symbol) ?? null;
      setSignalRow(found);
      setLoading(false);
    });
  }, [symbol]);

  // Compute full AI signal from history using signal engine - works even when market is closed
  const fullSignal = useMemo<Signal | null>(() => {
    const candles = [...(sec?.history?.content ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
    if (candles.length < 20) return null;
    const ltp = fund?.marketPrice ?? sec?.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.closePrice ?? 0;
    if (!ltp) return null;
    const mapped = candles.map(c => ({ open: c.closePrice, high: c.highPrice, low: c.lowPrice, close: c.closePrice, volume: c.totalTradedQuantity }));
    return generateSignal(mapped, ltp);
  }, [sec, fund]);

  // Simple signal for price/change display
  const localSignal = useMemo(() => {
    const candles = [...(sec?.history?.content ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
    if (candles.length < 3) return null;
    const ltp = fund?.marketPrice ?? sec?.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.closePrice ?? 0;
    const prev = sec?.details?.securityDailyTradeDto?.previousClose ?? candles.at(-2)?.closePrice ?? ltp;
    const change = ltp - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    return { ltp, change, changePct };
  }, [sec, fund]);

  const breakoutInfo = useMemo(() => {
    const candles = [...(sec?.history?.content ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate)).slice(-60);
    if (candles.length < 5) {
      // Fallback to signal row
      if (signalRow?.breakout) {
        return { signal: signalRow.breakout.signal, prevHigh: signalRow.breakout.entry, prevLow: signalRow.breakout.sl ?? 0, confidence: signalRow.breakout.confidence };
      }
      return null;
    }
    const ltp = fund?.marketPrice ?? sec?.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.closePrice ?? 0;
    const highs = candles.slice(0, -1).map(c => c.highPrice);
    const lows = candles.slice(0, -1).map(c => c.lowPrice);
    const prevHigh = Math.max(...highs);
    const prevLow = Math.min(...lows);
    const above = ltp > prevHigh;
    const below = ltp < prevLow;
    return { signal: above ? "BUY" : below ? "SELL" : "WAIT", prevHigh, prevLow, confidence: above || below ? 75 : 20 };
  }, [sec, fund, signalRow]);

  const daily = sec?.details?.securityDailyTradeDto;
  const lastCandle = sec?.history?.content?.length ? [...sec.history.content].sort((a,b) => a.businessDate.localeCompare(b.businessDate)).at(-1) : null;

  // Best price: MeroLagani fund > NEPSE daily > signal row > history
  const ltp = fund?.marketPrice ?? signalRow?.ltp ?? daily?.lastTradedPrice ?? lastCandle?.closePrice ?? 0;
  const chg = fund?.change ?? signalRow?.change ?? localSignal?.change ?? 0;
  const chgPct = localSignal?.changePct ?? (ltp && chg ? (chg / ltp) * 100 : 0);
  const open = daily?.openPrice ?? lastCandle?.closePrice; // Use last close as proxy for open
  const vol = daily?.totalTradeQuantity ?? lastCandle?.totalTradedQuantity;
  const prevClose = daily?.previousClose;
  const high52 = daily?.fiftyTwoWeekHigh;
  const low52 = daily?.fiftyTwoWeekLow;

  // Parse 52W range from fund if not in daily
  const fundWeekParts = fund?.weekRange?.split("-")?.map(s => parseNumber(s.trim())) ?? [];
  const from52 = high52 ?? fundWeekParts[1] ?? 0;
  const to52 = low52 ?? fundWeekParts[0] ?? 0;

  // AI Summary text — always build from available data
  const summaryLines: string[] = [];
  if (fullSignal || signalRow) {
    const rec = fullSignal?.recommendation ?? signalRow?.recommendation ?? "No Data";
    const conf = fullSignal?.confidence ?? signalRow?.confidence ?? 0;
    if (rec === "Strong Buy" || rec === "Buy") {
      summaryLines.push(`🟢 Strong BUY signal with ${conf}% confidence`);
    } else if (rec === "Strong Sell" || rec === "Sell") {
      summaryLines.push(`🔴 SELL signal with ${conf}% confidence`);
    } else if (rec === "No Data") {
      summaryLines.push(`⏳ Computing signals from historical data...`);
    } else {
      summaryLines.push(`🟡 Neutral — recommends HOLD (${conf}% confidence)`);
    }
    if (breakoutInfo) {
      if (breakoutInfo.signal === "BUY") summaryLines.push(`⚡ Breakout above resistance at ${npr(breakoutInfo.prevHigh)} — bullish`);
      else if (breakoutInfo.signal === "SELL") summaryLines.push(`⚡ Breakdown below support at ${npr(breakoutInfo.prevLow)} — bearish`);
      else summaryLines.push(`⚡ No breakout — trading within ${npr(breakoutInfo.prevLow)}–${npr(breakoutInfo.prevHigh)} range`);
    }
  }
  // Always add fundamental-driven summary
  if (fund) {
    if (fund.pe > 0 && fund.pe < 15) summaryLines.push(`📊 Undervalued (PE ${fund.pe.toFixed(1)}) — below market average`);
    else if (fund.pe > 30) summaryLines.push(`📊 Overvalued (PE ${fund.pe.toFixed(1)}) — above market average`);
    else if (fund.pe > 0) summaryLines.push(`📊 Fairly valued (PE ${fund.pe.toFixed(1)})`);
    if (fund.eps > 0) summaryLines.push(`💰 EPS ${fund.eps.toFixed(1)} — ${fund.eps > 20 ? "strong" : "moderate"} earnings`);
    if (fund.bookValue > 0 && ltp > 0) {
      const ratio = ltp / fund.bookValue;
      if (ratio < 1) summaryLines.push(`💎 Trading below book value — potential bargain (P/BV ${fund.pbv.toFixed(2)})`);
      else if (ratio > 3) summaryLines.push(`⚠️ Trading at ${ratio.toFixed(1)}x book value — premium valuation`);
    }
    if (fund.dividends.length > 0) {
      const avgDiv = fund.dividends.slice(0, 3).reduce((s, d) => s + d.value, 0) / Math.min(3, fund.dividends.length);
      if (avgDiv > 5) summaryLines.push(`💵 Strong dividend history averaging ${avgDiv.toFixed(1)}%`);
      else if (avgDiv > 0) summaryLines.push(`💵 Dividend yield averaging ${avgDiv.toFixed(1)}%`);
    }
    if (fund.marketCap && fund.marketCap !== "0") {
      summaryLines.push(`🏢 Market Cap: ${fund.marketCap}`);
    }
  }
  if (!summaryLines.length) summaryLines.push("📊 Data loading — check back during market hours for full analysis");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-foreground">{symbol}</span>
            {fund?.sector && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold capitalize text-muted">{fund.sector}</span>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted">Loading...</div>
          ) : (
            <div className="space-y-3">
              {/* Price Row */}
              {ltp > 0 && (
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-black tabular-nums">{npr(ltp)}</span>
                  <span className={`text-sm font-bold ${chg >= 0 ? "text-up" : "text-down"}`}>
                    {chg >= 0 ? "+" : ""}{npr(chg)} ({pct(chgPct)})
                  </span>
                </div>
              )}

              {/* 🤖 Agent — Best Analysis Summary */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-sm">🤖</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Agent — Best Analysis</span>
                </div>
                <ul className="space-y-1">
                  {summaryLines.map((line, i) => (
                    <li key={i} className="text-[11px] leading-tight text-foreground">{line}</li>
                  ))}
                </ul>
              </div>

              {/* ⚡ Breakout Signals */}
              <div className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-sm">⚡</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Breakout Signals</span>
                </div>
                {breakoutInfo ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        breakoutInfo.signal === "BUY" ? "bg-up-bg text-up" : 
                        breakoutInfo.signal === "SELL" ? "bg-down-bg text-down" : 
                        "bg-surface-2 text-muted"
                      }`}>
                        {breakoutInfo.signal === "BUY" ? "🟢 LONG" : breakoutInfo.signal === "SELL" ? "🔴 SHORT" : "⏸ WAIT"}
                      </span>
                      <span className="text-muted">{breakoutInfo.confidence}% confidence</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded bg-surface-2 p-1.5 text-center">
                        <span className="text-[9px] text-muted">Entry / Resistance</span>
                        <div className="font-bold tabular-nums">{npr(breakoutInfo.prevHigh)}</div>
                      </div>
                      <div className="rounded bg-surface-2 p-1.5 text-center">
                        <span className="text-[9px] text-muted">Support / SL</span>
                        <div className="font-bold tabular-nums">{npr(breakoutInfo.prevLow)}</div>
                      </div>
                    </div>
                    {signalRow?.breakout?.tp1 && (
                      <div className="rounded bg-surface-2 p-1.5 text-center text-xs">
                        <span className="text-[9px] text-muted">🎯 Target 1</span>
                        <div className="font-bold tabular-nums text-up">{npr(signalRow.breakout.tp1)}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-center text-[10px] text-muted">⏳ Insufficient historical data for breakout analysis</div>
                )}
              </div>

              {/* 🎯 Top Signals - Full 13 Indicator Analysis */}
              <div className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-sm">🎯</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Top AI Signals</span>
                  <span className="text-[8px] text-muted">(13 Indicators)</span>
                </div>
                {(fullSignal || signalRow) ? (() => {
                  const sig = fullSignal;
                  const rec = sig?.recommendation ?? signalRow?.recommendation ?? "No Data";
                  const conf = sig?.confidence ?? signalRow?.confidence ?? 0;
                  const bullFactors = sig?.factors.filter(f => f.verdict === "Bullish").length ?? 0;
                  const bearFactors = sig?.factors.filter(f => f.verdict === "Bearish").length ?? 0;
                  return (
                    <>
                      {/* Main Recommendation */}
                      <div className="mb-2 flex items-center gap-2">
                        <div className={`flex-1 rounded-lg p-2 text-center ${rec === "Strong Buy" || rec === "Buy" ? "bg-up-bg" : rec === "Strong Sell" || rec === "Sell" ? "bg-down-bg" : "bg-surface-2"}`}>
                          <div className="text-[9px] text-muted">AI Recommendation</div>
                          <div className={`text-sm font-bold ${rec === "Strong Buy" || rec === "Buy" ? "text-up" : rec === "Strong Sell" || rec === "Sell" ? "text-down" : "text-foreground"}`}>{rec}</div>
                          <div className="text-[9px] text-muted">{conf}% confidence</div>
                        </div>
                        <div className="flex-1 rounded-lg bg-surface-2 p-2 text-center">
                          <div className="text-[9px] text-muted">Factors</div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-bold text-up">▲{bullFactors}</span>
                            <span className="text-[9px] text-muted">/</span>
                            <span className="text-xs font-bold text-down">▼{bearFactors}</span>
                          </div>
                        </div>
                      </div>

                      {/* Key Indicators Grid */}
                      <div className="grid grid-cols-4 gap-1.5 text-xs">
                        {sig?.rsi !== null && sig?.rsi !== undefined && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">RSI</div>
                            <div className={`text-[10px] font-bold ${sig.rsi > 70 ? "text-down" : sig.rsi < 30 ? "text-up" : "text-foreground"}`}>{sig.rsi.toFixed(0)}</div>
                          </div>
                        )}
                        {sig?.macd && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">MACD</div>
                            <div className={`text-[10px] font-bold ${sig.macd.hist > 0 ? "text-up" : "text-down"}`}>{sig.macd.hist > 0 ? "+" : ""}{sig.macd.hist.toFixed(1)}</div>
                          </div>
                        )}
                        {sig?.sar && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">SAR</div>
                            <div className={`text-[10px] font-bold ${sig.sar.bullish ? "text-up" : "text-down"}`}>{sig.sar.bullish ? "▲" : "▼"}</div>
                          </div>
                        )}
                        {sig?.trend && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">Trend</div>
                            <div className={`text-[10px] font-bold ${sig.trend === "Up" ? "text-up" : sig.trend === "Down" ? "text-down" : "text-foreground"}`}>{sig.trend}</div>
                          </div>
                        )}
                        {sig?.vwap !== null && sig?.vwap !== undefined && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">VWAP</div>
                            <div className={`text-[10px] font-bold ${ltp > sig.vwap ? "text-up" : "text-down"}`}>{npr(sig.vwap)}</div>
                          </div>
                        )}
                        {sig?.atr !== null && sig?.atr !== undefined && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">ATR</div>
                            <div className="text-[10px] font-bold">{sig.atr.toFixed(1)}</div>
                          </div>
                        )}
                        {sig?.tmaDmaCross && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">TMA/DMA</div>
                            <div className={`text-[10px] font-bold ${sig.tmaDmaCross === "golden" || sig.tmaDmaCross === "bullish" ? "text-up" : "text-down"}`}>
                              {sig.tmaDmaCross === "golden" ? "⭐" : sig.tmaDmaCross === "death" ? "💀" : sig.tmaDmaCross === "bullish" ? "▲" : "▼"}
                            </div>
                          </div>
                        )}
                        {sig?.week52Position !== null && sig?.week52Position !== undefined && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">52W Pos</div>
                            <div className="text-[10px] font-bold">{sig.week52Position}%</div>
                          </div>
                        )}
                      </div>

                      {/* Price Levels */}
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
                        {sig?.buyZone && (
                          <div className="rounded bg-up-bg p-1.5 text-center">
                            <div className="text-[8px] text-muted">Buy Zone</div>
                            <div className="font-bold text-up">{npr(sig.buyZone[0])}–{npr(sig.buyZone[1])}</div>
                          </div>
                        )}
                        {sig?.stopLoss && (
                          <div className="rounded bg-down-bg p-1.5 text-center">
                            <div className="text-[8px] text-muted">Stop Loss</div>
                            <div className="font-bold text-down">{npr(sig.stopLoss)}</div>
                          </div>
                        )}
                        {sig?.target1 && (
                          <div className="rounded bg-surface-2 p-1.5 text-center">
                            <div className="text-[8px] text-muted">Target</div>
                            <div className="font-bold text-up">{npr(sig.target1)}</div>
                          </div>
                        )}
                      </div>

                      {/* Risk/Reward */}
                      {sig?.riskReward && (
                        <div className="mt-1.5 text-center text-[9px] text-muted">
                          Risk:Reward = <span className="font-bold text-foreground">1:{sig.riskReward.toFixed(1)}</span>
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <div className="py-2 text-center text-[10px] text-muted">⏳ Need 20+ candles for full signal analysis</div>
                )}
              </div>

              {/* 📊 Fundamental Analysis */}
              {fund && (
                <div className="rounded-lg border border-border p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-sm">📊</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Fundamental Analysis</span>
                    {fund.name && <span className="truncate text-[9px] text-muted">{fund.name}</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-xs">
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">EPS</span>
                      <div className="font-bold">{fund.eps > 0 ? fund.eps.toFixed(1) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">PE</span>
                      <div className="font-bold">{fund.pe > 0 ? fund.pe.toFixed(1) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">BV</span>
                      <div className="font-bold">{fund.bookValue > 0 ? fund.bookValue.toFixed(1) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">PBV</span>
                      <div className="font-bold">{fund.pbv > 0 ? fund.pbv.toFixed(2) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">ROE</span>
                      <div className="font-bold">{fund.roe > 0 ? `${fund.roe.toFixed(1)}%` : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">D/E</span>
                      <div className="font-bold">{fund.debtEquity > 0 ? fund.debtEquity.toFixed(2) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">Open</span>
                      <div className="font-bold tabular-nums">{open ? npr(open) : prevClose ? npr(prevClose) : "—"}</div>
                    </div>
                    <div className="rounded bg-surface-2 p-1.5 text-center">
                      <span className="text-[9px] text-muted">Volume</span>
                      <div className="font-bold tabular-nums">{vol ? num(vol) : "—"}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px]">
                    {(from52 || to52) && (
                      <div className="rounded bg-surface-2 p-1 text-center">
                        <span className="text-muted">52W Range</span>
                        <div className="font-bold tabular-nums">{from52 ? npr(from52) : "—"}–{to52 ? npr(to52) : "—"}</div>
                      </div>
                    )}
                    {fund.marketCap && (
                      <div className="rounded bg-surface-2 p-1 text-center">
                        <span className="text-muted">Market Cap</span>
                        <div className="font-bold truncate">{fund.marketCap}</div>
                      </div>
                    )}
                    {fund.dividends.length > 0 && (
                      <div className="rounded bg-surface-2 p-1 text-center">
                        <span className="text-muted">Dividend</span>
                        <div className="font-bold">{fund.dividends[0].value}% (FY {fund.dividends[0].fiscalYear})</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Full analysis link */}
              <Link href={`/stock/${encodeURIComponent(symbol)}`} onClick={onClose} className="block w-full rounded-lg bg-primary py-2 text-center text-xs font-semibold text-white hover:bg-primary-700">
                Full Analysis →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
