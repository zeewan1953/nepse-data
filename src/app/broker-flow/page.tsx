"use client";
import { useRef, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import { num, compact } from "@/lib/format";

/* ─── Types ─── */
type ScannerPick = {
  symbol: string; name: string; score: number; direction: "UP" | "DOWN";
  reasons: string[]; buyConc: number; sellConc: number; netBrokerAmt: number;
  volumeZScore: number; todayVolume: number; avgVolume: number; cmf: number | null; priceChange: number;
};
type ScannerResp = { date: string; picks: ScannerPick[]; generatedAt: number };

type OverviewResp = {
  date: string;
  totals: { brokers: number; stocks: number; totalBuyAmt: number; totalSellAmt: number };
  topAnomalies: Array<{ symbol: string; score: number; volumeZScore: number; buyConc: number; sellConc: number; flag: string }>;
  crossStockPatterns: Array<{ brokerId: string; stocks: Array<{ symbol: string; netAmt: number }>; totalNetAmt: number; stockCount: number }>;
};
type LeaderboardResp = {
  date: string;
  accumulation: Array<{ symbol: string; score: number; volumeZScore: number; buyConc: number }>;
  distribution: Array<{ symbol: string; score: number; volumeZScore: number; sellConc: number }>;
  crossStockPatterns: Array<{ brokerId: string; stocks: Array<{ symbol: string; netAmt: number }>; totalNetAmt: number; stockCount: number }>;
};
type StockFlowResp = {
  date: string; symbol: string;
  brokerFlows: Array<{ brokerId: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number }>;
  rollingTrend: Array<{ date: string; flows: Array<{ brokerId: string; netAmt: number }> }>;
  topBuyers: Array<{ brokerId: string; netAmt: number }>;
  topSellers: Array<{ brokerId: string; netAmt: number }>;
  cmf: { cmf: number; days: number } | null;
  mfi: { mfi: number; days: number } | null;
  concentration: { buyConc: number; sellConc: number } | null;
  concentrationTrend: Array<{ date: string; buyConc: number; sellConc: number }>;
  tickImbalance: { buyVolume: number; sellVolume: number; netImbalance: number; buyTrades: number; sellTrades: number; disclaimer: string };
  volumeZScore: { zScore: number; avgVolume: number; todayVolume: number };
  unusualFlags: Array<{ zScore: number; avgDailyQty: number; brokerQty: number }>;
};

function todayStr(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }); }

/* ─── useRetainedPoll: polls API, never loses data once received ─── */
function useRetainedPoll<T>(url: string, interval: number) {
  const { data, updatedAt } = usePoll<T>(url, interval);
  const retained = useRef<T | null>(null);
  if (data) retained.current = data;
  return { data: retained.current, live: data, updatedAt };
}

/* ─── Main Page ─── */
export default function BrokerFlowPage() {
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<"scanner" | "leaderboard" | "stock" | "patterns">("scanner");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker Activity & Money Flow</h1>
          <p className="text-sm text-muted">Net flow, concentration, anomaly detection, next-move scanner</p>
        </div>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary" />
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
        <b>Disclaimer:</b> Broker flow patterns are circumstantial and historical. Not proof of insider trading, not a guaranteed price predictor, and not investment advice.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          { key: "scanner", label: "🎯 Best 5 Scanner" },
          { key: "leaderboard", label: "🏆 Market Leaderboard" },
          { key: "stock", label: "📊 Stock Flow" },
          { key: "patterns", label: "🔗 Cross-Stock" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-surface-2"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "scanner" && <ScannerTab date={date} />}
      {tab === "leaderboard" && <LeaderboardTab date={date} />}
      {tab === "stock" && <StockFlowTab date={date} />}
      {tab === "patterns" && <PatternsTab date={date} />}
    </div>
  );
}

/* ─── Scanner Tab (Best 5 Next Move) ─── */
function ScannerTab({ date }: { date: string }) {
  const { data: scanner, updatedAt } = useRetainedPoll<ScannerResp>(`/api/broker-flow/scanner?date=${date}`, 3_000);
  const { data: overview } = useRetainedPoll<OverviewResp>(`/api/broker-flow/overview?date=${date}`, 3_000);
  const { data: lb } = useRetainedPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, 3_000);

  return (
    <div className="space-y-5">
      {/* Scanner: Best 5 Next Move */}
      <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-surface to-surface-2 p-5 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold">🎯 Best 5 — Next Move Scanner</h2>
            <p className="text-xs text-muted">
              Combines broker concentration, net flow, volume spike, CMF signals
              {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString("en-GB")}` : ""}
              <span className="ml-2 text-primary">· auto 3s</span>
            </p>
          </div>
        </div>

        {!scanner?.picks?.length && (
          <div className="py-8 text-center text-muted">
            Scanner needs at least 2 trading days of data. Sync floorsheet data for a few days to activate.
          </div>
        )}

        {scanner?.picks && scanner.picks.length > 0 && (
          <div className="grid gap-3 md:grid-cols-5">
            {scanner.picks.map((p, i) => (
              <ScannerCard key={p.symbol} pick={p} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      {/* Market overview stats */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active Brokers" value={num(overview.totals.brokers)} />
          <Stat label="Stocks Traded" value={num(overview.totals.stocks)} />
          <Stat label="Total Buy" value={compact(overview.totals.totalBuyAmt)} sub="text-up" />
          <Stat label="Total Sell" value={compact(overview.totals.totalSellAmt)} />
        </div>
      )}

      {/* Buy vs Sell summary */}
      {overview && (
        <BuySellBar buyAmt={overview.totals.totalBuyAmt} sellAmt={overview.totals.totalSellAmt} />
      )}

      {/* Top accumulation / distribution */}
      {lb && (
        <div className="grid gap-5 lg:grid-cols-2">
          <LeaderboardColumn title="🟢 Top Accumulation (Buy)" items={lb.accumulation.slice(0, 8)} tone="up" />
          <LeaderboardColumn title="🔴 Top Distribution (Sell)" items={lb.distribution.slice(0, 8)} tone="down" />
        </div>
      )}

      {/* Anomaly flags */}
      {overview?.topAnomalies && overview.topAnomalies.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-base font-bold">⚠️ Notable Activity Flags</h3>
          <div className="space-y-2">
            {overview.topAnomalies.map((a) => (
              <div key={a.symbol} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${a.flag === "highly_unusual" ? "bg-down-bg text-down" : a.flag === "unusual" ? "bg-amber-100 text-amber-700" : "bg-surface text-muted"}`}>
                    {a.flag.replace("_", " ")}
                  </span>
                  <Link href={`/stock/${a.symbol}`} className="font-bold text-primary hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
                </div>
                <div className="flex gap-4 text-xs tabular-nums">
                  <span>Vol Z: <b className={a.volumeZScore > 2 ? "text-down" : "text-foreground"}>{a.volumeZScore.toFixed(1)}</b></span>
                  <span>Buy: <b className="text-up">{a.buyConc.toFixed(0)}%</b></span>
                  <span>Sell: <b className="text-down">{a.sellConc.toFixed(0)}%</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Scanner Card ─── */
function ScannerCard({ pick, rank }: { pick: ScannerPick; rank: number }) {
  const isUp = pick.direction === "UP";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${isUp ? "border-up/40 bg-up-bg/30" : "border-down/40 bg-down-bg/30"}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-muted">#{rank}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${isUp ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
          {isUp ? "▲ UP" : "▼ DOWN"}
        </span>
      </div>
      <Link href={`/stock/${pick.symbol}`} className="mb-1 block text-base font-extrabold text-primary hover:underline">
        {pick.name}
      </Link>
      <div className="mb-2 text-xs text-muted">Score: <b className="text-foreground">{pick.score.toFixed(1)}</b></div>
      {/* Price change */}
      <div className={`mb-2 text-xs font-bold ${pick.priceChange >= 0 ? "text-up" : "text-down"}`}>
        {pick.priceChange >= 0 ? "+" : ""}{pick.priceChange.toFixed(2)}% today
      </div>
      {/* Reasons */}
      <div className="space-y-0.5">
        {pick.reasons.map((r, i) => (
          <div key={i} className="text-[10px] text-muted leading-tight">• {r}</div>
        ))}
      </div>
      {/* Key metrics */}
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <div>Buy Conc: <b className="text-up">{pick.buyConc.toFixed(0)}%</b></div>
        <div>Sell Conc: <b className="text-down">{pick.sellConc.toFixed(0)}%</b></div>
        <div>Vol Z: <b>{pick.volumeZScore.toFixed(1)}</b></div>
        <div>CMF: <b className={pick.cmf !== null && pick.cmf > 0 ? "text-up" : "text-down"}>{pick.cmf !== null ? pick.cmf.toFixed(3) : "N/A"}</b></div>
      </div>
    </div>
  );
}

/* ─── Buy vs Sell Bar ─── */
function BuySellBar({ buyAmt, sellAmt }: { buyAmt: number; sellAmt: number }) {
  const total = buyAmt + sellAmt;
  const buyPct = total > 0 ? (buyAmt / total) * 100 : 50;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">
        <span className="text-up">Buy: {compact(buyAmt)} ({buyPct.toFixed(1)}%)</span>
        <span className="text-down">Sell: {compact(sellAmt)} ({(100 - buyPct).toFixed(1)}%)</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full">
        <div className="bg-up transition-all" style={{ width: `${buyPct}%` }} />
        <div className="bg-down transition-all" style={{ width: `${100 - buyPct}%` }} />
      </div>
    </div>
  );
}

/* ─── Leaderboard Column ─── */
function LeaderboardColumn({ title, items, tone }: { title: string; items: Array<{ symbol: string; score: number; volumeZScore: number; buyConc?: number; sellConc?: number }>; tone: "up" | "down" }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tone === "up" ? "border-up/30 bg-surface" : "border-down/30 bg-surface"}`}>
      <h3 className={`mb-3 text-base font-bold ${tone === "up" ? "text-up" : "text-down"}`}>{title}</h3>
      {items.length === 0 && <p className="text-sm text-muted">No signals yet. Data accumulates over trading days.</p>}
      <div className="space-y-1.5">
        {items.map((a, i) => (
          <div key={a.symbol} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${tone === "up" ? "bg-up-bg/50" : "bg-down-bg/50"}`}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold text-muted">#{i + 1}</span>
              <Link href={`/stock/${a.symbol}`} className="font-bold hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
            </div>
            <div className="flex gap-3 text-xs tabular-nums">
              <span>Score: <b>{a.score.toFixed(1)}</b></span>
              <span>Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
              {a.buyConc !== undefined && <span>Buy: <b className="text-up">{a.buyConc.toFixed(0)}%</b></span>}
              {a.sellConc !== undefined && <span>Sell: <b className="text-down">{a.sellConc.toFixed(0)}%</b></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Leaderboard Tab (full) ─── */
function LeaderboardTab({ date }: { date: string }) {
  const { data: overview } = useRetainedPoll<OverviewResp>(`/api/broker-flow/overview?date=${date}`, 3_000);
  const { data: lb } = useRetainedPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, 3_000);

  return (
    <div className="space-y-5">
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active Brokers" value={num(overview.totals.brokers)} />
          <Stat label="Stocks Traded" value={num(overview.totals.stocks)} />
          <Stat label="Total Buy" value={compact(overview.totals.totalBuyAmt)} sub="text-up" />
          <Stat label="Total Sell" value={compact(overview.totals.totalSellAmt)} />
        </div>
      )}
      {overview && <BuySellBar buyAmt={overview.totals.totalBuyAmt} sellAmt={overview.totals.totalSellAmt} />}

      {lb && (
        <div className="grid gap-5 lg:grid-cols-2">
          <LeaderboardColumn title="🟢 Top Accumulation (Buy)" items={lb.accumulation} tone="up" />
          <LeaderboardColumn title="🔴 Top Distribution (Sell)" items={lb.distribution} tone="down" />
        </div>
      )}

      {overview?.topAnomalies && overview.topAnomalies.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-base font-bold">⚠️ Notable Activity Flags</h3>
          <div className="space-y-2">
            {overview.topAnomalies.map((a) => (
              <div key={a.symbol} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${a.flag === "highly_unusual" ? "bg-down-bg text-down" : a.flag === "unusual" ? "bg-amber-100 text-amber-700" : "bg-surface text-muted"}`}>
                    {a.flag.replace("_", " ")}
                  </span>
                  <Link href={`/stock/${a.symbol}`} className="font-bold text-primary hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
                </div>
                <div className="flex gap-4 text-xs tabular-nums">
                  <span>Vol Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
                  <span>Buy: <b className="text-up">{a.buyConc.toFixed(0)}%</b></span>
                  <span>Sell: <b className="text-down">{a.sellConc.toFixed(0)}%</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!overview && !lb && <div className="py-10 text-center text-muted">Loading market data…</div>}
    </div>
  );
}

/* ─── Stock Flow Detail Tab ─── */
function StockFlowTab({ date }: { date: string }) {
  const [symbol, setSymbol] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("");
  const { data } = useRetainedPoll<StockFlowResp>(activeSymbol ? `/api/broker-flow/stock?symbol=${activeSymbol}&date=${date}` : "", 3_000);

  const maxBar = useMemo(() => {
    if (!data?.brokerFlows) return 1;
    return Math.max(...data.brokerFlows.map((b) => Math.max(Math.abs(b.buyAmt), Math.abs(b.sellAmt))), 1);
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm font-semibold text-muted">🔍 Stock:</span>
        <form onSubmit={(e) => { e.preventDefault(); if (symbol.trim()) setActiveSymbol(symbol.trim().toUpperCase()); }} className="flex flex-1 items-center gap-2">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. NABIL, NICA"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary uppercase" />
          <button type="submit" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">Analyze</button>
        </form>
      </div>

      {!activeSymbol && <div className="py-10 text-center text-muted">Enter a stock symbol to analyze broker activity & money flow.</div>}

      {data && (
        <>
          {/* Key indicators */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="CMF (20d)" value={data.cmf ? data.cmf.cmf.toFixed(3) : "N/A"} sub={data.cmf ? `${data.cmf.days} days` : "need 20 days data"} />
            <Stat label="MFI (14d)" value={data.mfi ? data.mfi.mfi.toFixed(1) : "N/A"} sub={data.mfi ? `${data.mfi.days} days` : "need 14 days data"} />
            <Stat label="Vol Z-Score" value={data.volumeZScore.zScore.toFixed(2)} sub={`avg: ${compact(data.volumeZScore.avgVolume)}`} />
            <Stat label="Concentration" value={data.concentration ? `${data.concentration.buyConc.toFixed(0)}% / ${data.concentration.sellConc.toFixed(0)}%` : "N/A"} sub="buy / sell top-5" />
          </div>

          {/* Tick-rule: Buy vs Sell */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-2 text-base font-bold">📊 Tick-Rule Order Flow (Buy vs Sell)</h3>
            <p className="mb-3 text-[10px] text-amber-600">{data.tickImbalance.disclaimer}</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-up-bg/50 p-3">
                <div className="text-xs text-muted">Buy Volume</div>
                <div className="text-lg font-bold text-up tabular-nums">{compact(data.tickImbalance.buyVolume)}</div>
                <div className="text-xs text-muted">{data.tickImbalance.buyTrades} trades</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted">Net Imbalance</div>
                <div className={`text-lg font-bold tabular-nums ${data.tickImbalance.netImbalance >= 0 ? "text-up" : "text-down"}`}>
                  {data.tickImbalance.netImbalance >= 0 ? "+" : ""}{compact(data.tickImbalance.netImbalance)}
                </div>
                <div className="text-xs text-muted">{data.tickImbalance.netImbalance >= 0 ? "Buyers dominant" : "Sellers dominant"}</div>
              </div>
              <div className="rounded-lg bg-down-bg/50 p-3">
                <div className="text-xs text-muted">Sell Volume</div>
                <div className="text-lg font-bold text-down tabular-nums">{compact(data.tickImbalance.sellVolume)}</div>
                <div className="text-xs text-muted">{data.tickImbalance.sellTrades} trades</div>
              </div>
            </div>
          </div>

          {/* Broker net flow bar chart — showing both buy AND sell */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold">🏢 Broker Net Flow — Buy vs Sell (Top 15)</h3>
            <div className="space-y-1.5">
              {data.brokerFlows.slice(0, 15).map((b) => {
                const buyW = Math.max((b.buyAmt / maxBar) * 100, 1);
                const sellW = Math.max((b.sellAmt / maxBar) * 100, 1);
                return (
                  <div key={b.brokerId} className="flex items-center gap-2 text-xs">
                    <span className="w-10 shrink-0 font-bold">#{b.brokerId}</span>
                    <div className="flex flex-1 items-center gap-0.5">
                      <div className="h-4 rounded-l bg-up" style={{ width: `${buyW}%` }} title={`Buy: ${compact(b.buyAmt)}`} />
                      <div className="h-4 rounded-r bg-down" style={{ width: `${sellW}%` }} title={`Sell: ${compact(b.sellAmt)}`} />
                    </div>
                    <span className={`w-16 shrink-0 text-right font-bold tabular-nums ${b.netAmt >= 0 ? "text-up" : "text-down"}`}>
                      {b.netAmt >= 0 ? "+" : ""}{compact(b.netAmt)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-up" /> Buy</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-down" /> Sell</span>
            </div>
          </div>

          {/* Top buyers and top sellers side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-up/30 bg-surface p-4">
              <h3 className="mb-2 text-sm font-bold text-up">🟢 Top Buying Brokers</h3>
              {data.topBuyers.map((b, i) => (
                <div key={b.brokerId} className="flex items-center justify-between text-sm">
                  <span>#{i + 1} Broker <b>#{b.brokerId}</b></span>
                  <span className="font-bold text-up tabular-nums">+{compact(b.netAmt)}</span>
                </div>
              ))}
              {data.topBuyers.length === 0 && <div className="text-sm text-muted">No buyers</div>}
            </div>
            <div className="rounded-2xl border border-down/30 bg-surface p-4">
              <h3 className="mb-2 text-sm font-bold text-down">🔴 Top Selling Brokers</h3>
              {data.topSellers.map((b, i) => (
                <div key={b.brokerId} className="flex items-center justify-between text-sm">
                  <span>#{i + 1} Broker <b>#{b.brokerId}</b></span>
                  <span className="font-bold text-down tabular-nums">{compact(b.netAmt)}</span>
                </div>
              ))}
              {data.topSellers.length === 0 && <div className="text-sm text-muted">No sellers</div>}
            </div>
          </div>

          {/* Concentration trend */}
          {data.concentrationTrend.length > 1 && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="mb-3 text-base font-bold">📈 Concentration Trend (5-day)</h3>
              <div className="space-y-1">
                {data.concentrationTrend.map((c) => (
                  <div key={c.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-muted">{c.date}</span>
                    <div className="flex flex-1 items-center gap-1">
                      <div className="h-3 rounded bg-up" style={{ width: `${c.buyConc}%` }} />
                      <span className="text-up tabular-nums">{c.buyConc.toFixed(0)}%</span>
                      <span className="mx-1 text-muted">/</span>
                      <div className="h-3 rounded bg-down" style={{ width: `${c.sellConc}%` }} />
                      <span className="text-down tabular-nums">{c.sellConc.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unusual flow flags */}
          {data.unusualFlags.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <h3 className="mb-2 text-sm font-bold text-amber-700 dark:text-amber-400">⚠️ Unusual Broker Activity</h3>
              {data.unusualFlags.map((f, i) => (
                <div key={i} className="text-xs text-muted">
                  Broker net qty: {num(f.brokerQty)} vs avg daily: {num(f.avgDailyQty)} — Z-score: <b className="text-amber-600">{f.zScore.toFixed(1)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Cross-Stock Patterns Tab ─── */
function PatternsTab({ date }: { date: string }) {
  const { data } = useRetainedPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, 3_000);

  if (!data?.crossStockPatterns?.length) {
    return <div className="py-10 text-center text-muted">No cross-stock patterns detected. Data accumulates over multiple trading days.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-primary/30 bg-surface p-4">
        <h3 className="mb-1 text-base font-bold">🔗 Brokers Active Across Multiple Stocks</h3>
        <p className="text-xs text-muted">Brokers showing large net buying across 3+ stocks in the last 5 trading days.</p>
      </div>

      {data.crossStockPatterns.map((p) => (
        <div key={p.brokerId} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold">Broker #{p.brokerId}</h4>
            <div className="flex gap-3 text-xs tabular-nums">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{p.stockCount} stocks</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${p.totalNetAmt >= 0 ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
                Net: {p.totalNetAmt >= 0 ? "+" : ""}{compact(p.totalNetAmt)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.stocks.map((s) => (
              <Link key={s.symbol} href={`/stock/${s.symbol}`}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold hover:underline ${s.netAmt >= 0 ? "border-up/30 bg-up-bg text-up" : "border-down/30 bg-down-bg text-down"}`}>
                {s.symbol.replace(/\d+/g, "")} {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Shared ─── */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
