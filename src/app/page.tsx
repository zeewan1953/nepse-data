"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";

import { usePoll, usePersistentPoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus, NepseIndex, NepseSubIndex, TopTenItem } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, changeClass, num, compact } from "@/lib/format";
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

type AIRecommendation = {
  symbol: string; name: string; ltp: number; change: number; pctChange: number;
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  confidence: number; target: number | null; stopLoss: number | null;
  reason: string; patterns: string[];
  score: { technical: number; momentum: number; trend: number; volume: number; total: number };
};
type DeepResearchResp = {
  success: boolean; generatedAt: number;
  summary: { total: number; buy: number; sell: number; hold: number; avgConfidence: number };
  recommendations: { buy: AIRecommendation[]; sell: AIRecommendation[]; hold: AIRecommendation[] };
};

type NepsSummary = {
  generatedAt: number;
  nepseIndex: number;
  change: number;
  changePct: number;
  marketStatus: string;
  support: { s1: number; s2: number; s3: number };
  resistance: { r1: number; r2: number; r3: number };
  pivot: number;
  confidence: number;
  points: string[];
  accumulation: string[];
  distribution: string[];
  recommendation: string;
  brokerActivity: string;
  sentiment: string;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalVolume: number;
  totalValue: number;
};

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
  const live = usePersistentPoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);
  const deepResearch = usePoll<DeepResearchResp>("/api/deep-research", open ? 30_000 : 120_000);
  const nepseSummary = usePoll<NepsSummary>("/api/nepse-summary", open ? 60_000 : 300_000);

  const nepse =
    indices.data?.index?.find((i) => i.index === "NEPSE Index") ?? indices.data?.index?.[0];

  const allSignals = signals.data?.signals ?? [];
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

      {/* NEPSE AI Summary - Compact */}
      {nepseSummary.data && nepseSummary.data.nepseIndex > 0 && (
        <section className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 to-surface px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-sm font-black text-primary">📊 NEPSE विश्लेषण</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
              nepseSummary.data.recommendation === "BUY" ? "bg-up-bg text-up" :
              nepseSummary.data.recommendation === "SELL" ? "bg-down-bg text-down" :
              "bg-warning-bg text-warning"
            }`}>{nepseSummary.data.recommendation}</span>
            <span className="text-muted">Index: <span className="font-bold">{nepseSummary.data.nepseIndex}</span></span>
            <span className="text-up">S: {nepseSummary.data.support.s1}/{nepseSummary.data.support.s2}</span>
            <span className="text-down">R: {nepseSummary.data.resistance.r1}/{nepseSummary.data.resistance.r2}</span>
            <span className="text-muted">Pivot: <span className="font-bold">{nepseSummary.data.pivot}</span></span>
            <span className="text-up">▲{nepseSummary.data.upCount}</span>
            <span className="text-down">▼{nepseSummary.data.downCount}</span>
            <span className="text-muted">{nepseSummary.data.sentiment}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
            <span className="text-muted">{nepseSummary.data.points.slice(0, 2).join(" • ")}</span>
            {nepseSummary.data.accumulation.length > 0 && (
              <span className="text-up">📈 {nepseSummary.data.accumulation.join(", ")}</span>
            )}
            {nepseSummary.data.distribution.length > 0 && (
              <span className="text-down">📉 {nepseSummary.data.distribution.join(", ")}</span>
            )}
          </div>
        </section>
      )}

      {/* AI Recommendations - Deep Research Engine (TOP) */}
      {deepResearch.data?.success && deepResearch.data.recommendations && (
        <section className="rounded-lg border border-primary/40 bg-gradient-to-r from-primary/5 to-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 px-3 py-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black">🧠 AI Deep Research</h2>
              <span className="animate-pulse rounded bg-primary/20 px-1.5 py-0.5 text-[8px] font-bold text-primary">50+ INDICATORS</span>
              <span className="rounded bg-up-bg px-1.5 py-0.5 text-[8px] font-bold text-up">{deepResearch.data.summary.buy} BUY</span>
              <span className="rounded bg-down-bg px-1.5 py-0.5 text-[8px] font-bold text-down">{deepResearch.data.summary.sell} SELL</span>
            </div>
            <span className="text-[9px] text-muted">Confidence: {deepResearch.data.summary.avgConfidence}% | Updated: {new Date(deepResearch.data.generatedAt).toLocaleTimeString()}</span>
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-2">
            {/* Top 3 BUY */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-xs font-bold text-up">📈 Top 3 BUY Recommendations</span>
              </div>
              <div className="space-y-1.5">
                {deepResearch.data.recommendations.buy.slice(0, 3).map((r, i) => (
                  <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between rounded-lg border border-up/30 bg-up-bg/30 p-2 transition hover:shadow hover:border-up/60">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-up/20 text-[10px] font-bold text-up">#{i + 1}</span>
                      <div>
                        <div className="text-xs font-black text-primary">{r.symbol}</div>
                        <div className="text-[9px] text-muted">{npr(r.ltp)} <span className={r.pctChange >= 0 ? "text-up" : "text-down"}>{r.pctChange >= 0 ? "+" : ""}{r.pctChange.toFixed(2)}%</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${r.recommendation === "Strong Buy" ? "bg-up text-white" : "bg-up/80 text-white"}`}>{r.recommendation}</span>
                        <span className="text-[10px] font-bold text-up">{r.confidence}%</span>
                      </div>
                      {r.target && <div className="text-[8px] text-muted">TP: {npr(r.target)} | SL: {r.stopLoss ? npr(r.stopLoss) : "—"}</div>}
                    </div>
                  </Link>
                ))}
                {deepResearch.data.recommendations.buy.length === 0 && <div className="text-[10px] text-muted">No buy signals detected</div>}
              </div>
            </div>
            {/* Top 3 SELL */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-xs font-bold text-down">📉 Top 3 SELL Recommendations</span>
              </div>
              <div className="space-y-1.5">
                {deepResearch.data.recommendations.sell.slice(0, 3).map((r, i) => (
                  <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between rounded-lg border border-down/30 bg-down-bg/30 p-2 transition hover:shadow hover:border-down/60">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-down/20 text-[10px] font-bold text-down">#{i + 1}</span>
                      <div>
                        <div className="text-xs font-black text-primary">{r.symbol}</div>
                        <div className="text-[9px] text-muted">{npr(r.ltp)} <span className={r.pctChange >= 0 ? "text-up" : "text-down"}>{r.pctChange >= 0 ? "+" : ""}{r.pctChange.toFixed(2)}%</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${r.recommendation === "Strong Sell" ? "bg-down text-white" : "bg-down/80 text-white"}`}>{r.recommendation}</span>
                        <span className="text-[10px] font-bold text-down">{r.confidence}%</span>
                      </div>
                      {r.target && <div className="text-[8px] text-muted">TP: {npr(r.target)} | SL: {r.stopLoss ? npr(r.stopLoss) : "—"}</div>}
                    </div>
                  </Link>
                ))}
                {deepResearch.data.recommendations.sell.length === 0 && <div className="text-[10px] text-muted">No sell signals detected</div>}
              </div>
            </div>
          </div>
          <div className="border-t border-primary/20 px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-3 text-[8px] text-muted">
              <span className="font-bold">Score Breakdown:</span>
              <span>Technical: RSI, Stoch, CCI</span>
              <span>Momentum: MACD, Patterns</span>
              <span>Trend: SMA, EMA, ADX</span>
              <span>Volume: BB, VWAP</span>
            </div>
          </div>
        </section>
      )}

      {/* Live Market Data Panel */}
      <MarketPanel liveData={live.data ? (live.data as { data: LiveMarketData[] }).data : undefined} />

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

      {/* AI Signals + Breakout Signals - side by side */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Top AI Signals */}
        {allSignals.length > 0 && (
          <section className="rounded-lg border border-primary/30 bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold">🎯 Top AI</h2>
                <span className="animate-pulse rounded bg-primary/10 px-1 py-0.5 text-[7px] font-bold text-primary">AI</span>
                <span className="rounded bg-up-bg px-1 py-0.5 text-[7px] font-bold text-up">{allSignals.filter(s => s.recommendation === "Buy").length}B</span>
                <span className="rounded bg-down-bg px-1 py-0.5 text-[7px] font-bold text-down">{allSignals.filter(s => s.recommendation === "Sell").length}S</span>
              </div>
            </div>
            <div className="grid gap-1 p-1.5 sm:grid-cols-2">
              {allSignals.filter((s) => s.recommendation !== "Hold" || s.confidence > 70).slice(0, 6).map((s) => {
                const isBuy = s.recommendation === "Buy";
                const isSell = s.recommendation === "Sell";
                const confColor = s.confidence >= 80 ? "#22c55e" : s.confidence >= 60 ? "#f59e0b" : "#6b7280";
                return (
                  <Link key={s.symbol} href={`/stock/${s.symbol}`} className="rounded border border-border bg-surface-2 p-1.5 transition hover:shadow hover:border-primary/40">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-black text-primary">{s.symbol}</div>
                        <div className="text-[9px] text-muted">{npr(s.ltp)} <span className={`font-bold ${s.change >= 0 ? "text-up" : "text-down"}`}>{s.change >= 0 ? "+" : ""}{pct(s.change)}</span></div>
                      </div>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${confColor}15`, border: `1.5px solid ${confColor}` }}>
                        <span className="text-[8px] font-black" style={{ color: confColor }}>{s.confidence}</span>
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${isBuy ? "bg-up text-white" : isSell ? "bg-down text-white" : "bg-surface text-muted"}`}>
                        {isBuy ? "BUY" : isSell ? "SELL" : "HOLD"}
                      </span>
                      {s.rsi && <span className="text-[7px] text-muted">RSI:{s.rsi.toFixed(0)}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Breakout Signals */}
        <section className="rounded-lg border border-primary/30 bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold">⚡ Breakout</h2>
              <span className="animate-pulse rounded bg-primary/10 px-1 py-0.5 text-[7px] font-bold text-primary">SMC</span>
              <span className="rounded bg-up-bg px-1 py-0.5 text-[7px] font-bold text-up">{breakouts.filter(b => b.instBreakout?.status === "VALID BREAKOUT").length}V</span>
              <span className="rounded bg-down-bg px-1 py-0.5 text-[7px] font-bold text-down">{breakouts.filter(b => b.instBreakout?.status === "FAKE BREAKOUT (AVOID)").length}F</span>
            </div>
          </div>
          {signals.loading && !signals.data ? (
            <div className="px-3 py-4 text-center text-xs text-muted">Scanning…</div>
          ) : breakouts.length > 0 ? (
            <div className="grid gap-1 p-1.5 sm:grid-cols-2">
              {breakouts.slice(0, 6).map((s) => {
                const ib = s.instBreakout!;
                const isValid = ib.status === "VALID BREAKOUT";
                const confPct = Math.min(ib.score, 100);
                const confColor = confPct >= 90 ? "#22c55e" : confPct >= 70 ? "#f59e0b" : "#6b7280";
                return (
                  <Link key={s.symbol} href={`/stock/${s.symbol}`} className={`rounded border p-1.5 transition hover:shadow ${isValid ? "border-up/40 bg-up-bg/20" : "border-down/20 bg-down-bg/10 opacity-70"}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-black text-primary">{s.symbol}</div>
                        <div className="text-[9px] text-muted">{npr(s.ltp)} <span className={`font-bold ${s.change >= 0 ? "text-up" : "text-down"}`}>{s.change >= 0 ? "+" : ""}{pct(s.change)}</span></div>
                      </div>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${confColor}15`, border: `1.5px solid ${confColor}` }}>
                        <span className="text-[8px] font-black" style={{ color: confColor }}>{confPct}</span>
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      {ib.direction === "LONG" ? (
                        <span className="rounded bg-up px-1 py-0.5 text-[7px] font-bold text-white">LONG</span>
                      ) : ib.direction === "SHORT" ? (
                        <span className="rounded bg-down px-1 py-0.5 text-[7px] font-bold text-white">SHORT</span>
                      ) : (
                        <span className="rounded bg-surface-2 px-1 py-0.5 text-[7px] font-bold text-muted">—</span>
                      )}
                      <span className={`rounded px-0.5 py-0.5 text-[7px] font-bold ${isValid ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
                        {isValid ? "✅" : "❌"}
                      </span>
                      <span className="text-[7px] text-muted">R:R {ib.rr ? ib.rr.toFixed(1) : "—"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-center">
              <div className="text-[10px] text-muted">No breakouts detected</div>
            </div>
          )}
        </section>
      </div>

      {/* Market Scanner - bottom */}
      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold">🔍 Market Scanner</h2>
            <span className="animate-pulse rounded bg-primary/10 px-1.5 py-0.5 text-[7px] font-bold text-primary">LIVE</span>
          </div>
          <span className="text-[9px] text-muted">Auto-scanning {live.data ? ((live.data as any).data?.length ?? 0) : 0} stocks</span>
        </div>
        <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* High Volume */}
          <div className="rounded border border-border bg-surface-2 p-2">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[10px] font-bold text-blue-400">📊 High Volume</span>
            </div>
            <div className="space-y-1">
              {(live.data as any)?.data
                ?.filter((r: LiveMarketData) => classifySymbol(r.symbol, r.securityName) !== "DB" && !/\d/.test(r.symbol))
                ?.sort((a: LiveMarketData, b: LiveMarketData) => b.totalTradeValue - a.totalTradeValue)
                ?.slice(0, 4)
                .map((r: LiveMarketData) => (
                  <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between text-[10px] hover:text-primary">
                    <span className="font-bold">{r.symbol}</span>
                    <span className="text-muted">{compact(r.totalTradeValue)}</span>
                  </Link>
                )) ?? <div className="text-[9px] text-muted">Loading...</div>}
            </div>
          </div>
          {/* Active Stocks */}
          <div className="rounded border border-primary/30 bg-primary/5 p-2">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[10px] font-bold text-primary">⚡ Most Active</span>
            </div>
            <div className="space-y-1">
              {(live.data as any)?.data
                ?.filter((r: LiveMarketData) => classifySymbol(r.symbol, r.securityName) !== "DB" && !/\d/.test(r.symbol))
                ?.sort((a: LiveMarketData, b: LiveMarketData) => b.totalTradeQuantity - a.totalTradeQuantity)
                ?.slice(0, 4)
                .map((r: LiveMarketData) => (
                  <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between text-[10px] hover:text-primary">
                    <span className="font-bold">{r.symbol}</span>
                    <span className="text-muted">{num(r.totalTradeQuantity)}</span>
                  </Link>
                )) ?? <div className="text-[9px] text-muted">Loading...</div>}
            </div>
          </div>
        </div>
      </section>

      {/* Buy/Sell Pressure */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Buy Pressure */}
        <section className="rounded-lg border border-up/30 bg-up-bg/10 shadow-sm">
          <div className="flex items-center gap-2 border-b border-up/20 px-3 py-1.5">
            <span className="text-xs font-bold text-up">🟢 Buy Pressure</span>
            <span className="text-[8px] text-muted">Top Stocks</span>
          </div>
          <div className="space-y-1 p-2">
            {(live.data as any)?.data
              ?.filter((r: LiveMarketData) => classifySymbol(r.symbol, r.securityName) !== "DB" && !/\d/.test(r.symbol) && r.percentageChange > 0 && r.totalTradeValue > 0)
              ?.sort((a: LiveMarketData, b: LiveMarketData) => (b.percentageChange * b.totalTradeValue) - (a.percentageChange * a.totalTradeValue))
              ?.slice(0, 6)
              .map((r: LiveMarketData) => (
                <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between rounded px-2 py-1 text-[10px] hover:bg-up-bg/30">
                  <span className="font-bold text-foreground">{r.symbol}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{compact(r.totalTradeValue)}</span>
                    <span className="font-bold text-up">+{r.percentageChange.toFixed(2)}%</span>
                  </div>
                </Link>
              )) ?? <div className="text-[9px] text-muted">Loading...</div>}
          </div>
        </section>

        {/* Sell Pressure */}
        <section className="rounded-lg border border-down/30 bg-down-bg/10 shadow-sm">
          <div className="flex items-center gap-2 border-b border-down/20 px-3 py-1.5">
            <span className="text-xs font-bold text-down">🔴 Sell Pressure</span>
            <span className="text-[8px] text-muted">Top Stocks</span>
          </div>
          <div className="space-y-1 p-2">
            {(live.data as any)?.data
              ?.filter((r: LiveMarketData) => classifySymbol(r.symbol, r.securityName) !== "DB" && !/\d/.test(r.symbol) && r.percentageChange < 0 && r.totalTradeValue > 0)
              ?.sort((a: LiveMarketData, b: LiveMarketData) => (Math.abs(b.percentageChange) * b.totalTradeValue) - (Math.abs(a.percentageChange) * a.totalTradeValue))
              ?.slice(0, 6)
              .map((r: LiveMarketData) => (
                <Link key={r.symbol} href={`/stock/${r.symbol}`} className="flex items-center justify-between rounded px-2 py-1 text-[10px] hover:bg-down-bg/30">
                  <span className="font-bold text-foreground">{r.symbol}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{compact(r.totalTradeValue)}</span>
                    <span className="font-bold text-down">{r.percentageChange.toFixed(2)}%</span>
                  </div>
                </Link>
              )) ?? <div className="text-[9px] text-muted">Loading...</div>}
          </div>
        </section>
      </div>

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

function MarketPanel({ liveData }: { liveData: LiveMarketData[] | undefined }) {
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

  const displayed = expanded ? rows : rows.slice(0, 10);

  const arrow = (k: typeof sortKey) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-foreground">📊 Live Market</h2>
          <span className="text-[10px] text-muted">{rows.length} stocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-[10px] font-semibold sm:flex">
            {(["ALL", "EQ", "MF"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={`rounded px-2 py-0.5 transition ${filter === t ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{t}</button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-28 rounded border border-border bg-surface px-2 py-1 text-[10px] outline-none focus:border-primary sm:w-40" />
          <button onClick={() => setExpanded(!expanded)} className="rounded-lg bg-surface-2 px-3 py-1 text-[10px] font-bold text-primary hover:bg-surface-2/80">
            {expanded ? "Show Less" : `Show All (${rows.length})`}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ maxHeight: "500px", overflowY: "auto" }}>
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
            {!liveData && (
              <tr><td colSpan={10} className="px-2 py-6 text-center text-muted">Loading market data...</td></tr>
            )}
            {displayed.map((r) => {
              const chg = r.percentageChange;
              const bg = chg > 0 ? "bg-green-500" : chg < 0 ? "bg-red-500" : "bg-blue-500";
              const sType = classifySymbol(r.symbol, r.securityName);
              return (
                <tr key={r.symbol} className={`border-t border-border/50 ${bg} transition hover:opacity-90`}>
                  <td className="px-2 py-1.5">
                    <Link href={`/stock/${r.symbol}`} className="font-bold text-black hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${TYPE_BADGE[sType]}`}>{sType}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1.5 text-black">{r.securityName}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-black">{npr(r.lastTradedPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums text-black">{pct(chg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/70">{npr(r.openPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/70">{npr(r.highPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/70">{npr(r.lowPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/70">{num(r.totalTradeQuantity)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-black/70">{compact(r.totalTradeValue)}</td>
                </tr>
              );
            })}
            {liveData && displayed.length === 0 && (
              <tr><td colSpan={10} className="px-2 py-6 text-center text-muted">No data found</td></tr>
            )}
          </tbody>
        </table>
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
              <Link
                key={r.symbol}
                href={`/stock/${r.symbol}`}
                onClick={() => { setOpen(false); setQ(""); }}
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
              </Link>
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
    </div>
  );
}
