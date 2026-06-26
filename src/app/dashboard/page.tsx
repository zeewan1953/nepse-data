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

// ─── Breadth chip ────────────────────────────────────────────────────────────
function BreadthChip({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-1 items-center justify-between gap-2 border-r border-border px-4 py-2.5 last:border-r-0">
      <span className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <span>{icon}</span>{label}
      </span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
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
        {/* ── Top bar ── */}
        <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2.5">
          <Logo size={36} />


          {/* Index + turnover/volume */}
          <div className="flex items-center gap-5 border-l border-border pl-4">
            <div className="leading-tight">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">NEPSE</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold text-foreground tabular-nums">
                  {s ? fmt(s.nepseIndex, 2) : "—"}
                </span>
              </div>
              {s && (
                <div className={`text-[11px] font-semibold ${chgCls(s.change)}`}>
                  {s.change > 0 ? "+" : ""}{fmt(s.change, 2)} ({s.changePct > 0 ? "+" : ""}{fmt(s.changePct, 2)}%)
                </div>
              )}
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">Total Turnover</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{s ? cr(s.totalValue) : "—"}</div>
            </div>
            <div className="hidden leading-tight lg:block">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">Total Volume</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{s ? int(s.totalVolume) : "—"}</div>
            </div>
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-2" title="Search">🔍</button>
            <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted">
              <span className="h-2 w-2 rounded-full bg-gray-400" /> CLOSED
            </span>
            {mounted && (
              <button onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-2" title="Theme">
                {dark ? "☀️" : "🌙"}
              </button>
            )}
          </div>
        </header>

        {/* ── Ticker ── */}
        <Ticker stocks={tickerStocks} />

        {/* ── Breadth row ── */}
        <div className="flex flex-wrap border-b border-border bg-surface">
          <BreadthChip icon="📈" label="Advanced" value={s?.upCount ?? "—"} color="text-green-600" />
          <BreadthChip icon="📉" label="Declined" value={s?.downCount ?? "—"} color="text-red-600" />
          <BreadthChip icon="—" label="Unchanged" value={s?.flatCount ?? "—"} color="text-blue-500" />
          <BreadthChip icon="🟢" label="Transactions" value={s ? int(s.totalTransactions) : "—"} color="text-foreground" />
        </div>

        {/* ── Body ── */}
        <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(360px,420px)_1fr]">
          {/* Left: movers */}
          <MoversPanel movers={movers} />

          {/* Right: index + AI summary + day chips */}
          <div className="space-y-4">
            {/* Index header card */}
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
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">● CLOSED</span>
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

            {/* AI summary card */}
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
        </main>

        {/* ── Top Analysis + Breakout / Accumulation / Distribution ── */}
        <section className="space-y-4 px-4 pb-6">
          {/* Top Analysis strip */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-foreground">📊 Top Analysis</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Recommendation</div>
                <div className={`mt-1 text-sm font-bold ${actionCls.split(" ")[0]}`}>{s?.recommendation ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Sentiment</div>
                <div className={`mt-1 text-sm font-bold ${isBear ? "text-red-600" : "text-green-600"}`}>{s?.sentiment ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Confidence</div>
                <div className="mt-1 text-sm font-bold text-amber-600">{s ? `${s.confidence}%` : "—"}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Breakouts</div>
                <div className="mt-1 text-sm font-bold text-green-600">{breakout.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Accumulating</div>
                <div className="mt-1 text-sm font-bold text-green-600">{accumulation.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Distributing</div>
                <div className="mt-1 text-sm font-bold text-red-600">{distribution.length}</div>
              </div>
            </div>
          </div>

          {/* Breakout / Accumulation / Distribution panels */}
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

          {/* Indices + Sub-Indices */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IndexTable title="Indices" icon="📑" rows={indices.data?.index ?? []} />
            <IndexTable title="Sub-Indices" icon="🏷️" rows={indices.data?.subIndices ?? []} />
          </div>
        </section>
      </div>
    </div>
  );
}
