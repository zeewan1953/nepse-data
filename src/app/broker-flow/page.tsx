"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import { num, compact } from "@/lib/format";

/* ─── Types ─── */
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

/* ─── Main Page ─── */
export default function BrokerFlowPage() {
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<"leaderboard" | "stock" | "patterns">("leaderboard");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker Activity & Money Flow</h1>
          <p className="text-sm text-muted">Broker net flow, concentration, anomaly detection, cross-stock patterns</p>
        </div>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary" />
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
        <b>Disclaimer:</b> Broker flow patterns are circumstantial and historical. Not proof of insider trading, not a guaranteed price predictor, and not investment advice. Tick-rule classification is an approximation without real bid/ask data.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          { key: "leaderboard", label: "🏆 Market Leaderboard" },
          { key: "stock", label: "📊 Stock Flow Detail" },
          { key: "patterns", label: "🔗 Cross-Stock Patterns" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-surface-2"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && <LeaderboardTab date={date} />}
      {tab === "stock" && <StockFlowTab date={date} />}
      {tab === "patterns" && <PatternsTab date={date} />}
    </div>
  );
}

/* ─── Leaderboard Tab ─── */
function LeaderboardTab({ date }: { date: string }) {
  const { data: overview } = usePoll<OverviewResp>(`/api/broker-flow/overview?date=${date}`, 3_000);
  const { data: lb } = usePoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, 3_000);

  return (
    <div className="space-y-5">
      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active Brokers" value={num(overview.totals.brokers)} />
          <Stat label="Stocks Traded" value={num(overview.totals.stocks)} />
          <Stat label="Total Buy" value={compact(overview.totals.totalBuyAmt)} />
          <Stat label="Total Sell" value={compact(overview.totals.totalSellAmt)} />
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
                  <span>Buy Conc: <b>{a.buyConc.toFixed(0)}%</b></span>
                  <span>Sell Conc: <b>{a.sellConc.toFixed(0)}%</b></span>
                  <span>Score: <b className="text-primary">{a.score.toFixed(1)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accumulation / Distribution leaderboards */}
      {lb && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-up/30 bg-surface p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-up">🟢 Top Accumulation Candidates</h3>
            {lb.accumulation.length === 0 && <p className="text-sm text-muted">No accumulation signals yet. Data accumulates over trading days.</p>}
            <div className="space-y-1.5">
              {lb.accumulation.map((a, i) => (
                <div key={a.symbol} className="flex items-center justify-between rounded-lg bg-up-bg/50 px-3 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs font-bold text-muted">#{i + 1}</span>
                    <Link href={`/stock/${a.symbol}`} className="font-bold hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
                  </div>
                  <div className="flex gap-3 text-xs tabular-nums">
                    <span>Score: <b>{a.score.toFixed(1)}</b></span>
                    <span>Vol Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
                    <span>Conc: <b>{a.buyConc.toFixed(0)}%</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-down/30 bg-surface p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-down">🔴 Top Distribution Candidates</h3>
            {lb.distribution.length === 0 && <p className="text-sm text-muted">No distribution signals yet.</p>}
            <div className="space-y-1.5">
              {lb.distribution.map((a, i) => (
                <div key={a.symbol} className="flex items-center justify-between rounded-lg bg-down-bg/50 px-3 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs font-bold text-muted">#{i + 1}</span>
                    <Link href={`/stock/${a.symbol}`} className="font-bold hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
                  </div>
                  <div className="flex gap-3 text-xs tabular-nums">
                    <span>Score: <b>{a.score.toFixed(1)}</b></span>
                    <span>Vol Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
                    <span>Conc: <b>{a.sellConc.toFixed(0)}%</b></span>
                  </div>
                </div>
              ))}
            </div>
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
  const { data } = usePoll<StockFlowResp>(activeSymbol ? `/api/broker-flow/stock?symbol=${activeSymbol}&date=${date}` : "", 3_000);

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

          {/* Tick-rule imbalance */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-2 text-base font-bold">📊 Tick-Rule Order Flow</h3>
            <p className="mb-3 text-[10px] text-amber-600">{data.tickImbalance.disclaimer}</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-muted">Buy Volume</div>
                <div className="text-lg font-bold text-up tabular-nums">{compact(data.tickImbalance.buyVolume)}</div>
                <div className="text-xs text-muted">{data.tickImbalance.buyTrades} trades</div>
              </div>
              <div>
                <div className="text-xs text-muted">Net Imbalance</div>
                <div className={`text-lg font-bold tabular-nums ${data.tickImbalance.netImbalance >= 0 ? "text-up" : "text-down"}`}>
                  {data.tickImbalance.netImbalance >= 0 ? "+" : ""}{compact(data.tickImbalance.netImbalance)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Sell Volume</div>
                <div className="text-lg font-bold text-down tabular-nums">{compact(data.tickImbalance.sellVolume)}</div>
                <div className="text-xs text-muted">{data.tickImbalance.sellTrades} trades</div>
              </div>
            </div>
          </div>

          {/* Broker net flow bar chart */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold">🏢 Broker Net Flow (Top 15)</h3>
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
  const { data } = usePoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, 3_000);

  if (!data?.crossStockPatterns?.length) {
    return <div className="py-10 text-center text-muted">No cross-stock patterns detected. Data accumulates over multiple trading days.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-primary/30 bg-surface p-4">
        <h3 className="mb-1 text-base font-bold">🔗 Brokers Active Across Multiple Stocks</h3>
        <p className="text-xs text-muted">Brokers showing large net buying across 3+ stocks in the last 5 trading days. Presented as observable patterns — not proof of intent.</p>
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
