"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import { useTheme } from "@/lib/ThemeProvider";
import { Logo } from "@/components/Logo";
import type { LiveMarketData } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────
type Mover = { symbol: string; ltp: number; points: number; percentage: number; category?: string };
type MoversResp = { gainers: Mover[]; losers: Mover[]; volume: Mover[]; turnover: Mover[] };
type Summary = {
  nepseIndex: number; change: number; changePct: number;
  upCount: number; downCount: number; flatCount: number;
  totalValue: number; totalVolume: number; totalTransactions: number;
  sentiment: string; recommendation: string; confidence: number; points: string[];
};

// ─── Format helpers ──────────────────────────────────────────────────────────
const fmt = (n: number, dp = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const cr = (n: number) => `Rs. ${(n / 1e7).toFixed(2)} Cr`;
const int = (n: number) => Math.round(n).toLocaleString("en-IN");
const chgCls = (n: number) => (n > 0 ? "text-green-600" : n < 0 ? "text-red-600" : "text-gray-500");

// ─── Ticker strip ────────────────────────────────────────────────────────────
function Ticker({ stocks }: { stocks: LiveMarketData[] }) {
  if (!stocks.length) return <div className="h-9 border-b border-border bg-surface" />;
  const items = stocks.slice(0, 16);
  return (
    <div className="flex h-9 items-center gap-6 overflow-x-auto whitespace-nowrap border-b border-border bg-surface px-4 text-xs scrollbar-hide">
      {items.map((s) => {
        const pct = s.percentageChange ?? 0;
        return (
          <Link key={s.symbol} href={`/stock/${s.symbol}`} className="flex items-center gap-1.5 shrink-0 hover:opacity-70 transition">
            <span className="font-bold text-foreground">{s.symbol}</span>
            <span className="text-foreground">{fmt(s.lastTradedPrice ?? 0, 2)}</span>
            <span className={`font-semibold ${chgCls(pct)}`}>
              {pct > 0 ? "+" : ""}{fmt(pct, 2)}%
            </span>
          </Link>
        );
      })}
    </div>
  );
}



// ─── Top movers tabbed panel ─────────────────────────────────────────────────
function MoversPanel({ movers }: { movers: MoversResp | null }) {
  const [tab, setTab] = useState<"gainers" | "losers" | "volume">("gainers");
  const rows = movers ? movers[tab] ?? [] : [];
  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "gainers", label: "TOP GAINERS" },
    { key: "losers", label: "TOP LOSERS" },
    { key: "volume", label: "TOP VOLUME" },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-3 text-xs font-bold tracking-wide transition ${
              tab === t.key ? "border-b-2 border-green-600 text-green-600" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>Symbol</span>
        <span className="text-right">LTP</span>
        <span className="text-right">Change</span>
        <span className="text-right">% Chg</span>
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">No data available</div>
        ) : (
          rows.map((s) => (
            <Link
              href={`/stock/${s.symbol}`}
              key={s.symbol}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 border-b border-border/50 px-4 py-2.5 transition hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{s.symbol}</div>
                {s.category && <div className="truncate text-[10px] text-muted">{s.category}</div>}
              </div>
              <span className="text-right text-sm font-semibold text-foreground tabular-nums">{fmt(s.ltp, 2)}</span>
              <span className={`text-right text-sm font-semibold tabular-nums ${chgCls(s.points)}`}>
                {s.points > 0 ? "+" : ""}{fmt(s.points, 2)}
              </span>
              <span className={`text-right text-sm font-bold tabular-nums ${chgCls(s.percentage)}`}>
                {s.percentage > 0 ? "+" : ""}{fmt(s.percentage, 2)}%
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Index table mini-panel (Indices / Sub-Indices) ─────────────────────────
type IndexRow = { index: string; currentValue?: number; close?: number; change?: number; perChange?: number };

function IndexTable({ title, icon, rows }: { title: string; icon: string; rows: IndexRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground">
        <span>{icon}</span>{title}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>Symbol</span><span className="text-right">Current</span><span className="text-right">Chng</span><span className="text-right">%</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted">No data available</div>
        ) : (
          rows.map((r) => {
            const val = r.currentValue ?? r.close ?? 0;
            const ch = r.change ?? 0;
            const pc = r.perChange ?? 0;
            return (
              <div key={r.index} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-border/50 px-4 py-2 text-xs">
                <span className="truncate font-semibold text-foreground">{r.index}</span>
                <span className="text-right tabular-nums text-foreground">{fmt(val, 2)}</span>
                <span className={`text-right tabular-nums ${chgCls(ch)}`}>{ch > 0 ? "+" : ""}{fmt(ch, 2)}</span>
                <span className={`w-12 text-right font-semibold tabular-nums ${chgCls(pc)}`}>{pc > 0 ? "+" : ""}{fmt(pc, 2)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Stock list mini-panel (Breakout / Accumulation / Distribution) ──────────
function StockMiniPanel({
  title, icon, accent, rows, hint,
}: {
  title: string; icon: string; accent: string;
  rows: Array<{ symbol: string; ltp: number; percentage: number }>;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${accent}`}>
          <span>{icon}</span>{title}
        </h3>
        <span className="text-[9px] text-muted">{hint}</span>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted">No data available</div>
        ) : (
          rows.map((s) => (
            <Link
              href={`/stock/${s.symbol}`}
              key={s.symbol}
              className="flex items-center justify-between border-b border-border/50 px-4 py-2 transition hover:bg-surface-2"
            >
              <span className="text-sm font-bold text-foreground">{s.symbol}</span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(s.ltp, 2)}</span>
                <span className={`w-16 text-right text-sm font-bold tabular-nums ${chgCls(s.percentage)}`}>
                  {s.percentage > 0 ? "+" : ""}{fmt(s.percentage, 2)}%
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const { dark, toggle } = useTheme();
  const [movers, setMovers] = useState<MoversResp | null>(null);

  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);
  const summary = usePoll<Summary>("/api/nepse-summary", 60_000);
  const indices = usePoll<{ index: IndexRow[]; subIndices: IndexRow[] }>("/api/indices", 60_000);

  useEffect(() => {
    setMounted(true);
    const load = () => fetch("/api/movers").then((r) => (r.ok ? r.json() : null)).then(setMovers).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const s = summary.data;
  const tickerStocks = live.data?.data ?? [];

  // Compute Signal Leaderboard from live data
  const signalLeaderboard = useMemo(() => {
    if (!tickerStocks.length) return [];
    
    return tickerStocks
      .filter((stock) => {
        const symbol = stock.symbol;
        // Filter: must contain letters, max 10 chars, NOT start with number, exclude MF
        return /\D/.test(symbol) && 
               symbol.length <= 10 && 
               !/^\d/.test(symbol) &&
               !symbol.toUpperCase().includes('MF');
      })
      .map((stock) => {
        const pct = stock.percentageChange ?? 0;
        const volume = stock.totalTradeQuantity ?? 0;
        const price = stock.lastTradedPrice ?? 0;
        
        // Simple momentum based on % change
        const momentumScore = Math.min(100, Math.max(-100, pct * 10));
        
        // Volume signal (high volume = accumulation/distribution)
        const avgVolume = tickerStocks.reduce((sum, s) => sum + (s.totalTradeQuantity ?? 0), 0) / tickerStocks.length;
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
        const volumeZScore = (volumeRatio - 1) * 2;
        
        // Smart money: positive change + high volume = smart buying
        const smartMoneyScore = pct > 0 && volumeRatio > 1.5 
          ? Math.min(100, pct * 5 + volumeRatio * 10) 
          : pct < 0 && volumeRatio > 1.5 
            ? Math.max(-100, pct * 5 - volumeRatio * 10)
            : 0;
        
        // Order flow classification
        const orderFlow = pct > 2 ? "Buy Pressure" : pct < -2 ? "Sell Pressure" : "Neutral";
        
        // Confidence level based on data quality and signal strength
        const dataCompleteness = tickerStocks.length > 0 ? 100 : 0;
        const signalStrength = Math.abs(momentumScore) + Math.abs(smartMoneyScore);
        const confidenceLevel = signalStrength > 50 ? "High" : signalStrength > 25 ? "Medium" : "Low";
        
        return {
          symbol: stock.symbol,
          ltp: price,
          momentumScore,
          volumeZScore,
          smartMoneyScore,
          orderFlow,
          changePercent: pct,
          volume,
          confidenceLevel,
        };
      })
      .sort((a, b) => b.momentumScore - a.momentumScore)
      .slice(0, 12); // Top 12 signals
  }, [tickerStocks]);

  // Sentiment styling
  const isBear = (s?.recommendation ?? "").toUpperCase().includes("SELL") || (s?.sentiment ?? "").toLowerCase().includes("bear") || (s?.changePct ?? 0) < 0;
  const action = (s?.recommendation ?? "HOLD").split(" ")[0].toUpperCase();
  const actionCls = action.includes("BUY") ? "text-green-600 border-green-300" : action.includes("SELL") ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300";

  const summaryText = useMemo(() => {
    if (!s?.points?.length) return [];
    return s.points.slice(0, 6);
  }, [s]);

  // Derive Breakout / Accumulation / Distribution from movers (works locally + on Vercel).
  const breakout = useMemo(
    () => (movers?.gainers ?? []).filter((g) => g.percentage >= 8).slice(0, 8),
    [movers],
  );
  const accumulation = useMemo(
    () => (movers?.volume ?? []).filter((v) => v.percentage >= 0 && v.percentage < 4).slice(0, 8),
    [movers],
  );
  const distribution = useMemo(
    () => (movers?.volume ?? []).filter((v) => v.percentage < 0).slice(0, 8),
    [movers],
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Body ── */}
        <main className="grid flex-1 grid-cols-1 gap-4 p-4">
          {/* Row 1: NEPSE INDEX + AI Summary (TOP) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: NEPSE INDEX */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>🗓️ {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  <span>🕐 {mounted ? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""} NST</span>
                </div>
                <span className="text-[10px] text-muted">आइत–बिहि · ११:०० – ३:०० NST</span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted">
                NEPSE INDEX
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className={`text-4xl font-extrabold tabular-nums ${s ? chgCls(s.change) : "text-foreground"}`}>
                  {s ? fmt(s.nepseIndex, 2) : "—"}
                </span>
                {s && (
                  <span className={`text-lg font-semibold ${chgCls(s.change)}`}>
                    {s.change > 0 ? "▲" : "▼"} {fmt(Math.abs(s.change), 2)} ({s.changePct > 0 ? "+" : ""}{fmt(s.changePct, 2)}%)
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted">🔄 {summary.data ? "Updated less than a minute ago" : "Loading…"}</div>

              {/* mini stats */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><div className="text-[10px] font-semibold uppercase text-muted">Turnover</div><div className="text-sm font-bold tabular-nums">{s ? cr(s.totalValue) : "—"}</div></div>
                <div><div className="text-[10px] font-semibold uppercase text-muted">Volume</div><div className="text-sm font-bold tabular-nums">{s ? int(s.totalVolume) : "—"}</div></div>
                <div><div className="text-[10px] font-semibold uppercase text-muted">Transactions</div><div className="text-sm font-bold tabular-nums">{s ? int(s.totalTransactions) : "—"}</div></div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-muted">Market Breadth</div>
                  <div className="text-xs font-bold">
                    <span className="text-green-600">{s?.upCount ?? "—"} up</span>{" "}
                    <span className="text-red-600">{s?.downCount ?? "—"} dn</span>{" "}
                    <span className="text-blue-500">{s?.flatCount ?? "—"} nc</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: AI Summary */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">🧠 बजार सारांश</div>

              <div className="mt-3 flex items-center gap-3">
                <span className={`rounded-md border px-4 py-1.5 text-sm font-bold ${actionCls}`}>{action}</span>
                <span className={`text-sm font-bold ${isBear ? "text-red-600" : "text-green-600"}`}>
                  {s?.sentiment ?? "—"}
                </span>
                <span className="text-xs text-muted">· {isBear ? "Distributing" : "Accumulating"}</span>
              </div>

              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-foreground">
                {summaryText.length ? (
                  summaryText.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span>{p}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-muted">विश्लेषण लोड हुँदैछ…</li>
                )}
              </ul>

              {/* Recommendation line */}
              {s?.recommendation && (
                <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted">सिफारिस: </span>
                  <span className={`font-bold ${actionCls.split(" ")[0]}`}>{s.recommendation}</span>
                </div>
              )}

              {/* confidence bar */}
              {s && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, s.confidence)}%` }} />
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted">भरोसा {s.confidence}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Breakout / Accumulation / Distribution */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StockMiniPanel
              title="Breakout"
              icon="🚀"
              accent="text-green-600"
              hint="≥ 8% gainers"
              rows={breakout}
            />
            <StockMiniPanel
              title="Accumulation"
              icon="🟢"
              accent="text-green-600"
              hint="high vol · quiet buy"
              rows={accumulation}
            />
            <StockMiniPanel
              title="Distribution"
              icon="🔴"
              accent="text-red-600"
              hint="high vol · selling"
              rows={distribution}
            />
          </div>

          {/* Row 3: Signal Leaderboard (Left) + Sub-Indices (Right) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: Signal Leaderboard */}
            {signalLeaderboard.length > 0 && (
              <div className="rounded-xl border border-border bg-surface">
                {/* Disclaimer */}
                <div className="border-b border-border bg-amber-500/10 px-3 py-1.5">
                  <p className="text-[8px] leading-relaxed text-amber-700">
                    <strong>⚠️</strong> Signals reflect current technical data. Not investment advice.
                  </p>
                </div>

                <div className="p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="flex items-center gap-1 text-[10px] font-bold text-foreground">
                      <span>📊</span> Signal Leaderboard
                      <span className="rounded-full bg-primary/10 px-1 py-0.5 text-[8px] font-bold text-primary">TOP {signalLeaderboard.length}</span>
                    </h3>
                    <span className="text-[8px] text-muted">Real-time</span>
                  </div>

                  {/* Compact Table Header */}
                  <div className="mb-1 grid grid-cols-12 gap-1 px-1.5 py-1 text-[7px] font-bold uppercase tracking-wide text-muted">
                    <div className="col-span-2">Symbol</div>
                    <div className="col-span-1 text-right">LTP</div>
                    <div className="col-span-2 text-right">Momentum</div>
                    <div className="col-span-2 text-right">Smart $</div>
                    <div className="col-span-1 text-right">Vol Z</div>
                    <div className="col-span-2 text-center">Order Flow</div>
                    <div className="col-span-2 text-center">Confidence</div>
                  </div>

                  {/* Compact Table Body */}
                  <div className="max-h-[280px] space-y-0.5 overflow-y-auto">
                    {signalLeaderboard.map((signal, i) => {
                      const momentumColor = signal.momentumScore > 20 ? "text-green-600" : signal.momentumScore < -20 ? "text-red-600" : "text-muted";
                      const smartMoneyColor = signal.smartMoneyScore > 20 ? "text-green-600" : signal.smartMoneyScore < -20 ? "text-red-600" : "text-muted";
                      const orderFlowColor = signal.orderFlow === "Buy Pressure" ? "text-green-600" : signal.orderFlow === "Sell Pressure" ? "text-red-600" : "text-muted";
                      const orderFlowBg = signal.orderFlow === "Buy Pressure" ? "bg-green-500/10" : signal.orderFlow === "Sell Pressure" ? "bg-red-500/10" : "bg-surface-2";
                      const confidenceColor = signal.confidenceLevel === "High" ? "text-green-600" : signal.confidenceLevel === "Medium" ? "text-amber-600" : "text-muted";
                      const confidenceBg = signal.confidenceLevel === "High" ? "bg-green-500/10" : signal.confidenceLevel === "Medium" ? "bg-amber-500/10" : "bg-surface-2";

                      return (
                        <Link
                          key={signal.symbol}
                          href={`/stock/${signal.symbol}`}
                          className="grid grid-cols-12 gap-1 rounded border border-border px-1.5 py-1 transition hover:border-primary/50 hover:bg-surface-2"
                        >
                          <div className="col-span-2">
                            <div className="text-[9px] font-bold text-foreground">{signal.symbol}</div>
                            <div className="text-[7px] text-muted">{fmt(signal.changePercent, 1)}%</div>
                          </div>
                          <div className="col-span-1 text-right">
                            <div className="text-[9px] font-bold text-foreground">{fmt(signal.ltp, 0)}</div>
                          </div>
                          <div className={`col-span-2 text-right text-[9px] font-bold ${momentumColor}`}>
                            {signal.momentumScore.toFixed(0)}
                          </div>
                          <div className={`col-span-2 text-right text-[9px] font-bold ${smartMoneyColor}`}>
                            {signal.smartMoneyScore.toFixed(0)}
                          </div>
                          <div className="col-span-1 text-right">
                            <div className={`text-[9px] font-bold ${signal.volumeZScore > 1 ? "text-green-600" : signal.volumeZScore < -1 ? "text-red-600" : "text-muted"}`}>
                              {signal.volumeZScore.toFixed(1)}
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${orderFlowBg} ${orderFlowColor}`}>
                              {signal.orderFlow === "Buy Pressure" ? "🟢Buy" : signal.orderFlow === "Sell Pressure" ? "🔴Sell" : "⚪Neutral"}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${confidenceBg} ${confidenceColor}`}>
                              {signal.confidenceLevel === "High" ? "🟢High" : signal.confidenceLevel === "Medium" ? "🟡Med" : "⚪Low"}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Right: Sub-Indices */}
            <IndexTable title="Sub-Indices" icon="📑" rows={indices.data?.subIndices ?? []} />
          </div>

          {/* Row 4: Movers (Full Width) */}
          <MoversPanel movers={movers} />
        </main>

        {/* ── Ticker (bottom) ── */}
        <Ticker stocks={tickerStocks} />
      </div>
    </div>
  );
}
