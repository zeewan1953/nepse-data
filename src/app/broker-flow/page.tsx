"use client";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePersistentPoll, isNepseMarketOpen } from "@/lib/useLive";
import { num, compact } from "@/lib/format";
import { useNotification } from "@/lib/NotificationContext";

/* ─── Types ─── */
type ScannerPick = {
  symbol: string; name: string; score: number; direction: "LONG" | "SHORT";
  reasons: string[]; buyConc: number; sellConc: number; netBrokerAmt: number;
  totalBuyAmt: number; totalSellAmt: number;
  volumeZScore: number; todayVolume: number; avgVolume: number; cmf: number | null; priceChange: number;
};
type ScannerResp = { date: string; longPicks: ScannerPick[]; shortPicks: ScannerPick[]; generatedAt: number; source?: string };
type OverviewResp = {
  date: string;
  source?: string;
  totals: { brokers: number; stocks: number; totalBuyAmt: number; totalSellAmt: number };
  topAnomalies: Array<{ symbol: string; score: number; volumeZScore: number; buyConc: number; sellConc: number; flag: string }>;
  crossStockPatterns: Array<{ brokerId: string; stocks: Array<{ symbol: string; netAmt: number }>; totalNetAmt: number; stockCount: number }>;
};
type LeaderboardResp = {
  date: string;
  source?: string;
  accumulation: Array<{ symbol: string; score: number; volumeZScore: number; buyConc: number }>;
  distribution: Array<{ symbol: string; score: number; volumeZScore: number; sellConc: number }>;
  crossStockPatterns: Array<{
    brokerId: string;
    stocks: Array<{ symbol: string; netAmt: number; buyQty: number; sellQty: number }>;
    totalNetAmt: number;
    totalBuyAmt: number;
    totalSellAmt: number;
    stockCount: number;
  }>;
};
type StockFlowResp = {
  date: string; symbol: string; error?: string; source?: string;
  brokerFlows?: Array<{ brokerId: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number }>;
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
const FIVE_MIN = 5 * 60 * 1000;
const TABS = [
  { key: "scanner" as const, icon: "🎯", label: "Scanner" },
  { key: "leaderboard" as const, icon: "🏆", label: "Leaderboard" },
  { key: "stock" as const, icon: "📊", label: "Stock Flow" },
  { key: "patterns" as const, icon: "🔗", label: "Cross-Stock" },
];

/* ─── Loading Skeleton ─── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-border/50 ${className}`} />;
}
function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── MAIN PAGE ─── */
/* ═══════════════════════════════════════════════ */
export default function BrokerFlowPage() {
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<"scanner" | "leaderboard" | "stock" | "patterns">("scanner");
  const [marketOpen, setMarketOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const check = () => setMarketOpen(isNepseMarketOpen());
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  // Fetch overview to detect data source
  useEffect(() => {
    fetch(`/api/broker-flow/overview?date=${date}`)
      .then(r => r.json())
      .then(d => setDataSource(d?.source ?? null))
      .catch(() => {});
  }, [date]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/broker-flow/cache?date=${todayStr()}`, { method: "DELETE" });
    } catch {}
    const keys = Object.keys(localStorage).filter(k => k.startsWith("ppoll:/api/broker-flow/"));
    keys.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/cron/broker-sync?date=${date}`);
      // Clear cache and reload
      await fetch(`/api/broker-flow/cache?date=${date}`, { method: "DELETE" });
      const keys = Object.keys(localStorage).filter(k => k.startsWith("ppoll:/api/broker-flow/"));
      keys.forEach(k => localStorage.removeItem(k));
      window.location.reload();
    } catch {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* ── Compact Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold leading-tight text-foreground sm:text-2xl">
            Broker Activity &amp; Money Flow
          </h1>
          <p className="text-xs text-muted sm:text-sm">Net flow, concentration, anomaly detection, next-move scanner</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Date Picker */}
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary sm:text-sm" />
          {/* Refresh */}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-95 disabled:opacity-50 sm:text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Market Status + Data Source Row ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${marketOpen ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {marketOpen ? "Market Open" : "Market Closed"}
          </span>
          {dataSource && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              dataSource === "real"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
            }`}>
              {dataSource === "real" ? "● Real NEPSE Data" : "○ Sample Data"}
            </span>
          )}
          {dataSource !== "real" && (
            <button onClick={handleSync} disabled={syncing}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary transition hover:bg-primary/20 active:scale-95 disabled:opacity-50">
              {syncing ? (
                <><svg className="h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Syncing…</>
              ) : "⬇ Sync NEPSE Data"}
            </button>
          )}
        </div>
        <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 sm:text-right">
          ⚠ Historical patterns only — not investment advice
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0.5 rounded-xl border border-border bg-surface/80 p-0.5 backdrop-blur">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm ${
              tab === t.key
                ? "bg-primary text-white shadow-sm"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}>
            <span className="hidden sm:inline">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        {tab === "scanner" && <ScannerTab date={date} />}
        {tab === "leaderboard" && <LeaderboardTab date={date} />}
        {tab === "stock" && <StockFlowTab date={date} />}
        {tab === "patterns" && <PatternsTab date={date} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── SCANNER TAB ─── */
/* ═══════════════════════════════════════════════ */
function ScannerTab({ date }: { date: string }) {
  const { data: scanner, updatedAt } = usePersistentPoll<ScannerResp>(`/api/broker-flow/scanner?date=${date}`, FIVE_MIN);
  const { data: overview } = usePersistentPoll<OverviewResp>(`/api/broker-flow/overview?date=${date}`, FIVE_MIN);
  const { data: lb } = usePersistentPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, FIVE_MIN);
  const { notify } = useNotification();
  const prevLongRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const longCount = scanner?.longPicks?.length ?? 0;
    if (prevLongRef.current > 0 && longCount > prevLongRef.current) {
      const topPick = scanner?.longPicks?.[0];
      notify("New Broker Signal", topPick ? `${topPick.symbol} detected as LONG pick` : "New scanner signals available", "broker");
    }
    prevLongRef.current = longCount;
  }, [scanner?.longPicks?.length, notify, scanner?.longPicks]);

  // Loading state
  if (!scanner && !overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const hasData = scanner && (scanner.longPicks.length > 0 || scanner.shortPicks.length > 0);

  return (
    <div className="space-y-4">
      {/* Market Overview Stats */}
      {overview && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <MiniStat icon="👥" label="Active Brokers" value={num(overview.totals.brokers)} />
          <MiniStat icon="📈" label="Stocks Traded" value={num(overview.totals.stocks)} />
          <MiniStat icon="🟢" label="Total Buy" value={compact(overview.totals.totalBuyAmt)} accent="text-up" />
          <MiniStat icon="🔴" label="Total Sell" value={compact(overview.totals.totalSellAmt)} accent="text-down" />
        </div>
      )}

      {/* Buy vs Sell Bar */}
      {overview && <BuySellBar buyAmt={overview.totals.totalBuyAmt} sellAmt={overview.totals.totalSellAmt} />}

      {/* Scanner Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
          <span>🎯</span> Best 5 Long &amp; Short
        </h2>
        {mounted && updatedAt && (
          <span className="text-[10px] text-muted">updated {new Date(updatedAt).toLocaleTimeString("en-GB")}</span>
        )}
      </div>

      {!hasData && (
        <EmptyState icon="🎯" message="Scanner needs trading data. Sync floorsheet to populate signals." />
      )}

      {hasData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* LONG picks */}
          <PickColumn title="Best 5 for LONG" icon="🟢" picks={scanner.longPicks} tone="up" />
          {/* SHORT picks */}
          <PickColumn title="Best 5 for SHORT" icon="🔴" picks={scanner.shortPicks} tone="down" />
        </div>
      )}

      {/* Top Accumulation / Distribution (quick preview) */}
      {lb && (
        <div className="grid gap-4 lg:grid-cols-2">
          <QuickLeaderboard title="Top Accumulation" items={lb.accumulation.slice(0, 5)} tone="up" />
          <QuickLeaderboard title="Top Distribution" items={lb.distribution.slice(0, 5)} tone="down" />
        </div>
      )}

      {/* Anomaly Flags */}
      {overview?.topAnomalies && overview.topAnomalies.filter(a => a.flag !== "normal").length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold">⚠️ Unusual Activity</h3>
          <div className="space-y-1.5">
            {overview.topAnomalies.filter(a => a.flag !== "normal").map((a) => (
              <AnomalyRow key={a.symbol} anomaly={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Scanner Sub-components ─── */
function MiniStat({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</div>
        <div className={`text-sm font-bold tabular-nums sm:text-base ${accent ?? ""}`}>{value}</div>
      </div>
    </div>
  );
}

function PickColumn({ title, icon, picks, tone }: { title: string; icon: string; picks: ScannerPick[]; tone: "up" | "down" }) {
  const borderColor = tone === "up" ? "border-up/30" : "border-down/30";
  const headerBg = tone === "up" ? "bg-up/5" : "bg-down/5";
  return (
    <div className={`rounded-xl border ${borderColor} bg-surface shadow-sm overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerBg}`}>
        <span>{icon}</span>
        <h3 className="text-sm font-extrabold">{title}</h3>
        {picks.length > 0 && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${tone === "up" ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
            {picks.length} signals
          </span>
        )}
      </div>
      <div className="p-3">
        {picks.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">No signals detected.</p>
        ) : (
          <div className="space-y-2">
            {picks.map((p, i) => <ScannerRow key={p.symbol} pick={p} rank={i + 1} tone={tone} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ScannerRow({ pick, rank, tone }: { pick: ScannerPick; rank: number; tone: "up" | "down" }) {
  return (
    <div className={`rounded-lg border p-2.5 transition hover:shadow-sm ${tone === "up" ? "border-up/20 bg-up-bg/20" : "border-down/20 bg-down-bg/20"}`}>
      {/* Top: Rank + Symbol + Score */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-border/50 text-[10px] font-bold text-muted">{rank}</span>
          <Link href={`/stock/${pick.symbol}`} className="text-sm font-extrabold text-primary hover:underline">
            {pick.name}
          </Link>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${tone === "up" ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
            {tone === "up" ? "▲ LONG" : "▼ SHORT"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted">Score</span>
          <b className="text-sm tabular-nums">{(pick.score ?? 0).toFixed(0)}</b>
        </div>
      </div>
      {/* Metrics row */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px]">
        <span className={`font-bold ${(pick.priceChange ?? 0) >= 0 ? "text-up" : "text-down"}`}>
          {(pick.priceChange ?? 0) >= 0 ? "+" : ""}{(pick.priceChange ?? 0).toFixed(2)}%
        </span>
        <span>Buy: <b className="text-up">{(pick.buyConc ?? 0).toFixed(0)}%</b></span>
        <span>Sell: <b className="text-down">{(pick.sellConc ?? 0).toFixed(0)}%</b></span>
        <span>Z: <b>{(pick.volumeZScore ?? 0).toFixed(1)}</b></span>
        {pick.cmf != null && <span>CMF: <b className={pick.cmf > 0 ? "text-up" : "text-down"}>{pick.cmf.toFixed(2)}</b></span>}
      </div>
      {/* Reasons */}
      <div className="flex flex-wrap gap-1">
        {pick.reasons.map((r, i) => (
          <span key={i} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${tone === "up" ? "bg-up-bg/60 text-up" : "bg-down-bg/60 text-down"}`}>
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuickLeaderboard({ title, items, tone }: { title: string; items: Array<{ symbol: string; score: number; volumeZScore: number; buyConc?: number; sellConc?: number }>; tone: "up" | "down" }) {
  const borderColor = tone === "up" ? "border-up/20" : "border-down/20";
  return (
    <div className={`rounded-xl border ${borderColor} bg-surface shadow-sm overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-2 ${tone === "up" ? "bg-up/5" : "bg-down/5"}`}>
        <span>{tone === "up" ? "🟢" : "🔴"}</span>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="divide-y divide-border/30 p-2">
        {items.length === 0 && <p className="py-3 text-center text-xs text-muted">No data yet</p>}
        {items.map((a, i) => (
          <div key={a.symbol} className="flex items-center justify-between px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-4 text-right font-bold text-muted">{i + 1}</span>
              <Link href={`/stock/${a.symbol}`} className="font-bold hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
            </div>
            <div className="flex gap-3 tabular-nums">
              <span>Score: <b>{a.score.toFixed(0)}</b></span>
              <span>Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
              {a.buyConc !== undefined && <span className="text-up">{a.buyConc.toFixed(0)}%</span>}
              {a.sellConc !== undefined && <span className="text-down">{a.sellConc.toFixed(0)}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnomalyRow({ anomaly }: { anomaly: { symbol: string; volumeZScore: number; buyConc: number; sellConc: number; flag: string } }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-500/10 bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
          {anomaly.flag.replace("_", " ")}
        </span>
        <Link href={`/stock/${anomaly.symbol}`} className="text-sm font-bold text-primary hover:underline">{anomaly.symbol.replace(/\d+/g, "")}</Link>
      </div>
      <div className="flex gap-3 text-[11px] tabular-nums">
        <span>Z: <b className={anomaly.volumeZScore > 2 ? "text-amber-600" : "text-foreground"}>{anomaly.volumeZScore.toFixed(1)}</b></span>
        <span className="text-up">{anomaly.buyConc.toFixed(0)}%</span>
        <span className="text-down">{anomaly.sellConc.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* ─── Buy vs Sell Bar ─── */
function BuySellBar({ buyAmt, sellAmt }: { buyAmt: number; sellAmt: number }) {
  const total = buyAmt + sellAmt;
  const buyPct = total > 0 ? (buyAmt / total) * 100 : 50;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold sm:text-sm">
        <span className="text-up">Buy: {compact(buyAmt)} ({buyPct.toFixed(1)}%)</span>
        <span className="text-down">Sell: {compact(sellAmt)} ({(100 - buyPct).toFixed(1)}%)</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full sm:h-4">
        <div className="bg-up transition-all" style={{ width: `${buyPct}%` }} />
        <div className="bg-down transition-all" style={{ width: `${100 - buyPct}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface/50 py-10 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── LEADERBOARD TAB ─── */
/* ═══════════════════════════════════════════════ */
function LeaderboardTab({ date }: { date: string }) {
  const { data: overview } = usePersistentPoll<OverviewResp>(`/api/broker-flow/overview?date=${date}`, FIVE_MIN);
  const { data: lb } = usePersistentPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, FIVE_MIN);

  if (!overview && !lb) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><CardSkeleton /><CardSkeleton /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {overview && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <MiniStat icon="👥" label="Active Brokers" value={num(overview.totals.brokers)} />
          <MiniStat icon="📈" label="Stocks Traded" value={num(overview.totals.stocks)} />
          <MiniStat icon="🟢" label="Total Buy" value={compact(overview.totals.totalBuyAmt)} accent="text-up" />
          <MiniStat icon="🔴" label="Total Sell" value={compact(overview.totals.totalSellAmt)} accent="text-down" />
        </div>
      )}
      {overview && <BuySellBar buyAmt={overview.totals.totalBuyAmt} sellAmt={overview.totals.totalSellAmt} />}

      {/* Full Leaderboard */}
      {lb && (
        <div className="grid gap-4 lg:grid-cols-2">
          <LeaderboardTable title="Top Accumulation (Buy)" icon="🟢" items={lb.accumulation} tone="up" />
          <LeaderboardTable title="Top Distribution (Sell)" icon="🔴" items={lb.distribution} tone="down" />
        </div>
      )}

      {/* All Anomalies */}
      {overview?.topAnomalies && overview.topAnomalies.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">⚠️ All Activity Flags</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-3 font-semibold">Flag</th>
                  <th className="pb-2 pr-3 font-semibold">Stock</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Score</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Vol Z</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Buy %</th>
                  <th className="pb-2 text-right font-semibold">Sell %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {overview.topAnomalies.map((a) => (
                  <tr key={a.symbol} className="group">
                    <td className="py-1.5 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        a.flag === "highly_unusual" ? "bg-down-bg text-down" : a.flag === "unusual" ? "bg-amber-100 text-amber-700" : "bg-surface-2 text-muted"
                      }`}>{a.flag.replace("_", " ")}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Link href={`/stock/${a.symbol}`} className="font-bold text-primary hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.score.toFixed(0)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${a.volumeZScore > 2 ? "font-bold text-amber-600" : ""}`}>{a.volumeZScore.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-up">{a.buyConc.toFixed(0)}%</td>
                    <td className="py-1.5 text-right tabular-nums text-down">{a.sellConc.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardTable({ title, icon, items, tone }: {
  title: string; icon: string; tone: "up" | "down";
  items: Array<{ symbol: string; score: number; volumeZScore: number; buyConc?: number; sellConc?: number }>;
}) {
  return (
    <div className={`rounded-xl border bg-surface shadow-sm overflow-hidden ${tone === "up" ? "border-up/20" : "border-down/20"}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 ${tone === "up" ? "bg-up/5" : "bg-down/5"}`}>
        <span>{icon}</span>
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="ml-auto text-[10px] text-muted">{items.length} stocks</span>
      </div>
      <div className="divide-y divide-border/30">
        {items.length === 0 && <p className="py-6 text-center text-xs text-muted">No data yet</p>}
        {items.map((a, i) => (
          <div key={a.symbol} className={`flex items-center justify-between px-4 py-2 text-xs transition ${
            i === 0 && tone === "up" ? "bg-up-bg/30" : i === 0 && tone === "down" ? "bg-down-bg/30" : "hover:bg-surface-2"
          }`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                i === 0 ? "bg-amber-400/20 text-amber-600" : i === 1 ? "bg-gray-300/30 text-gray-500" : i === 2 ? "bg-orange-300/20 text-orange-500" : "text-muted"
              }`}>{i + 1}</span>
              <Link href={`/stock/${a.symbol}`} className="font-bold hover:underline">{a.symbol.replace(/\d+/g, "")}</Link>
            </div>
            <div className="flex gap-3 tabular-nums">
              <span>Score: <b>{a.score.toFixed(0)}</b></span>
              <span>Z: <b>{a.volumeZScore.toFixed(1)}</b></span>
              {a.buyConc !== undefined && <span className="text-up">{a.buyConc.toFixed(0)}%</span>}
              {a.sellConc !== undefined && <span className="text-down">{a.sellConc.toFixed(0)}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── STOCK FLOW TAB ─── */
/* ═══════════════════════════════════════════════ */
type StockInfo = { symbol: string; name: string; price: number; change: number; volume: number; turnover: number };

function StockFlowTab({ date }: { date: string }) {
  const [symbol, setSymbol] = useState("NABIL");
  const [activeSymbol, setActiveSymbol] = useState("NABIL");
  const [showDropdown, setShowDropdown] = useState(false);
  const [allStocks, setAllStocks] = useState<StockInfo[]>([]);
  const { data } = usePersistentPoll<StockFlowResp>(activeSymbol ? `/api/broker-flow/stock?symbol=${activeSymbol}&date=${date}` : "", FIVE_MIN);

  // Fetch all stocks for autocomplete
  useEffect(() => {
    fetch("/api/broker-flow/stocks")
      .then((r) => r.json())
      .then((d) => { if (d.stocks?.length) setAllStocks(d.stocks); })
      .catch(() => {});
  }, []);

  // Filter stocks based on search input
  const filteredStocks = useMemo(() => {
    if (!symbol.trim()) return allStocks.slice(0, 20);
    const q = symbol.trim().toUpperCase();
    return allStocks
      .filter((s) => s.symbol.toUpperCase().includes(q))
      .slice(0, 15);
  }, [symbol, allStocks]);

  const maxBar = useMemo(() => {
    if (!data?.brokerFlows) return 1;
    return Math.max(...data.brokerFlows.map((b) => Math.max(Math.abs(b.buyAmt), Math.abs(b.sellAmt))), 1);
  }, [data]);

  const handleSelectStock = (s: string) => {
    setSymbol(s);
    setActiveSymbol(s);
    setShowDropdown(false);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar with Autocomplete */}
      <div className="relative">
        <form onSubmit={(e) => { e.preventDefault(); if (symbol.trim()) { setActiveSymbol(symbol.trim().toUpperCase()); setShowDropdown(false); } }}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={symbol} onChange={(e) => { setSymbol(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="Search stock… e.g. NABIL"
              className="w-full bg-transparent text-sm font-semibold uppercase outline-none placeholder:normal-case placeholder:font-normal placeholder:text-muted/50" />
          </div>
          <button type="submit"
            className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 active:scale-95">
            Analyze
          </button>
        </form>

        {/* Autocomplete Dropdown */}
        {showDropdown && filteredStocks.length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {filteredStocks.map((s) => (
              <button key={s.symbol} type="button"
                onClick={() => handleSelectStock(s.symbol)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/10 transition">
                <span className="font-bold uppercase">{s.symbol}</span>
                <span className={`text-xs ${s.change >= 0 ? "text-up" : "text-down"}`}>
                  {s.change >= 0 ? "▲" : "▼"} {Math.abs(s.change).toFixed(2)}%
                </span>
              </button>
            ))}
            {allStocks.length > 0 && (
              <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted">
                {allStocks.length} stocks available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {!data && activeSymbol && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {data && data.error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-down/30 bg-down-bg/20 py-12 text-center">
          <span className="text-3xl">🔍</span>
          <div>
            <p className="text-sm font-bold text-down">No data found for &ldquo;{data.symbol}&rdquo;</p>
            <p className="mt-1 text-xs text-muted">This stock may not have broker flow data for this date. Try: NABIL, NICA, SANIMA, CHCL, SBL, NMB, EBL, NLG, HIDCL, SCB, GBIME, PCBL, UPPER, BPCL, NRN</p>
          </div>
        </div>
      )}

      {data && !data.error && data.brokerFlows && (
        <>
          {/* Stock Title */}
          <div className="flex items-center gap-3">
            <Link href={`/stock/${data.symbol}`} className="text-lg font-extrabold text-primary hover:underline">{data.symbol}</Link>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">{data.date}</span>
          </div>

          {/* Key Indicators */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <IndicatorCard label="CMF (20d)" value={data.cmf ? data.cmf.cmf.toFixed(3) : "N/A"}
              sub={data.cmf ? `${data.cmf.days}d window` : "need 20d"} color={data.cmf && data.cmf.cmf > 0 ? "up" : "down"} />
            <IndicatorCard label="MFI (14d)" value={data.mfi ? data.mfi.mfi.toFixed(1) : "N/A"}
              sub={data.mfi ? `${data.mfi.days}d window` : "need 14d"} color={data.mfi && data.mfi.mfi > 50 ? "up" : "down"} />
            <IndicatorCard label="Vol Z-Score" value={data.volumeZScore?.zScore?.toFixed(2) ?? "N/A"}
              sub={data.volumeZScore ? `avg: ${compact(data.volumeZScore.avgVolume)}` : ""} color={(data.volumeZScore?.zScore ?? 0) > 1.5 ? "up" : "neutral"} />
            <IndicatorCard label="Concentration" value={data.concentration ? `${data.concentration.buyConc.toFixed(0)}% / ${data.concentration.sellConc.toFixed(0)}%` : "N/A"}
              sub="buy / sell top-5" color="neutral" />
          </div>

          {/* Tick-Rule Order Flow */}
          {data.tickImbalance && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold">📊 Tick-Rule Order Flow</h3>
              <span className="text-[9px] text-amber-600 dark:text-amber-400">Estimated (tick-rule model)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <TickCard label="Buy Volume" value={compact(data.tickImbalance.buyVolume)} sub={`${data.tickImbalance.buyTrades} trades`} tone="up" />
              <TickCard label="Net Imbalance" value={`${data.tickImbalance.netImbalance >= 0 ? "+" : ""}${compact(data.tickImbalance.netImbalance)}`}
                sub={data.tickImbalance.netImbalance >= 0 ? "Buyers dominant" : "Sellers dominant"}
                tone={data.tickImbalance.netImbalance >= 0 ? "up" : "down"} highlight />
              <TickCard label="Sell Volume" value={compact(data.tickImbalance.sellVolume)} sub={`${data.tickImbalance.sellTrades} trades`} tone="down" />
            </div>
          </div>
          )}

          {/* Broker Net Flow Chart */}
          {data.brokerFlows?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold">🏢 Broker Net Flow — Top 30</h3>
            <div className="space-y-1">
              {data.brokerFlows.slice(0, 30).map((b) => {
                const buyW = Math.max((b.buyAmt / maxBar) * 100, 1);
                const sellW = Math.max((b.sellAmt / maxBar) * 100, 1);
                return (
                  <div key={b.brokerId} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 shrink-0 text-right font-bold text-muted">#{b.brokerId}</span>
                    <div className="flex flex-1 items-center gap-0.5">
                      <div className="h-3.5 rounded-l bg-up/80" style={{ width: `${buyW}%` }} title={`Buy: ${compact(b.buyAmt)}`} />
                      <div className="h-3.5 rounded-r bg-down/80" style={{ width: `${sellW}%` }} title={`Sell: ${compact(b.sellAmt)}`} />
                    </div>
                    <span className={`w-14 shrink-0 text-right font-bold tabular-nums ${b.netAmt >= 0 ? "text-up" : "text-down"}`}>
                      {b.netAmt >= 0 ? "+" : ""}{compact(b.netAmt)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-muted">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-up/80" /> Buy</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-down/80" /> Sell</span>
            </div>
          </div>
          )}

          {/* Top Buyers & Sellers */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BrokerList title="Top Buying Brokers" icon="🟢" items={data.topBuyers ?? []} tone="up" />
            <BrokerList title="Top Selling Brokers" icon="🔴" items={data.topSellers ?? []} tone="down" />
          </div>

          {/* Concentration Trend */}
          {data.concentrationTrend?.length > 1 && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold">📈 Concentration Trend (5-day)</h3>
              <div className="space-y-1.5">
                {data.concentrationTrend.map((c) => (
                  <div key={c.date} className="flex items-center gap-3 text-[11px]">
                    <span className="w-20 shrink-0 text-muted">{c.date}</span>
                    <div className="flex flex-1 items-center gap-1.5">
                      <div className="h-2.5 rounded bg-up/60" style={{ width: `${c.buyConc}%` }} />
                      <span className="w-8 text-right text-up tabular-nums">{c.buyConc.toFixed(0)}%</span>
                      <span className="text-border">/</span>
                      <div className="h-2.5 rounded bg-down/60" style={{ width: `${c.sellConc}%` }} />
                      <span className="w-8 text-right text-down tabular-nums">{c.sellConc.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unusual Flags */}
          {data.unusualFlags?.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <h3 className="mb-2 text-sm font-bold text-amber-700 dark:text-amber-400">⚠️ Unusual Broker Activity</h3>
              {data.unusualFlags.map((f, i) => (
                <div key={i} className="text-[11px] text-muted">
                  Broker net qty: {num(f.brokerQty)} vs avg daily: {num(f.avgDailyQty)} — Z: <b className="text-amber-600">{f.zScore.toFixed(1)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Stock Flow Sub-components ─── */
function IndicatorCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: "up" | "down" | "neutral" }) {
  const accent = color === "up" ? "text-up" : color === "down" ? "text-down" : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums sm:text-base ${accent}`}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}

function TickCard({ label, value, sub, tone, highlight }: { label: string; value: string; sub: string; tone: "up" | "down"; highlight?: boolean }) {
  const bg = highlight
    ? tone === "up" ? "bg-up-bg/60 border-up/30" : "bg-down-bg/60 border-down/30"
    : tone === "up" ? "bg-up-bg/30 border-up/10" : "bg-down-bg/30 border-down/10";
  return (
    <div className={`rounded-lg border p-2.5 text-center ${bg}`}>
      <div className="text-[10px] font-medium text-muted">{label}</div>
      <div className={`text-sm font-extrabold tabular-nums sm:text-base ${tone === "up" ? "text-up" : "text-down"}`}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}

function BrokerList({ title, icon, items, tone }: { title: string; icon: string; items: Array<{ brokerId: string; netAmt: number }>; tone: "up" | "down" }) {
  return (
    <div className={`rounded-xl border bg-surface shadow-sm overflow-hidden ${tone === "up" ? "border-up/20" : "border-down/20"}`}>
      <div className={`flex items-center gap-2 px-4 py-2 ${tone === "up" ? "bg-up/5" : "bg-down/5"}`}>
        <span>{icon}</span>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="divide-y divide-border/30 p-2">
        {items.length === 0 && <p className="py-3 text-center text-xs text-muted">No data</p>}
        {items.map((b, i) => (
          <div key={b.brokerId} className="flex items-center justify-between px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-4 text-right font-bold text-muted">{i + 1}</span>
              <span>Broker <b>#{b.brokerId}</b></span>
            </div>
            <span className={`font-bold tabular-nums ${tone === "up" ? "text-up" : "text-down"}`}>
              {tone === "up" ? "+" : ""}{compact(b.netAmt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── CROSS-STOCK PATTERNS TAB ─── */
/* ═══════════════════════════════════════════════ */
function PatternsTab({ date }: { date: string }) {
  const { data } = usePersistentPoll<LeaderboardResp>(`/api/broker-flow/leaderboard?date=${date}`, FIVE_MIN);
  const [brokerSearch, setBrokerSearch] = useState("");

  if (!data) {
    return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  }

  const patterns = data?.crossStockPatterns ?? [];
  const filtered = brokerSearch.trim()
    ? patterns.filter(p => p.brokerId.includes(brokerSearch.trim()))
    : patterns;

  return (
    <div className="space-y-4">
      {/* Header with search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">🔗 All Brokers — Cross-Stock Activity</h3>
          <p className="mt-0.5 text-xs text-muted">All {patterns.length} brokers — cross-stock activity over the last 5 trading days.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 border border-border">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={brokerSearch} onChange={(e) => setBrokerSearch(e.target.value)}
            placeholder="Search broker #..."
            className="w-28 bg-transparent text-xs font-semibold outline-none placeholder:font-normal placeholder:text-muted/50" />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-12 text-center">
          <span className="text-3xl">{brokerSearch ? "🔍" : "🔗"}</span>
          <p className="text-sm text-muted">
            {brokerSearch ? `No broker matching "${brokerSearch}"` : "No cross-stock patterns detected yet."}
          </p>
        </div>
      )}

      {filtered.map((p) => (
        <div key={p.brokerId} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link href={`/broker/${p.brokerId}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary hover:bg-primary/20 transition">
                {p.brokerId}
              </Link>
              <div>
                <h4 className="text-sm font-bold">Broker #{p.brokerId}</h4>
                <p className="text-[10px] text-muted">{p.stockCount} stocks traded</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{p.stockCount} stocks</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${p.totalNetAmt >= 0 ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
                Net: {p.totalNetAmt >= 0 ? "+" : ""}{compact(p.totalNetAmt)}
              </span>
              <span className="rounded-full bg-up-bg/50 px-2 py-0.5 text-up">Buy: {compact(p.totalBuyAmt)}</span>
              <span className="rounded-full bg-down-bg/50 px-2 py-0.5 text-down">Sell: {compact(p.totalSellAmt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.stocks.map((s) => (
              <Link key={s.symbol} href={`/stock/${s.symbol}`}
                className={`group flex flex-col rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition hover:shadow-md ${
                  s.netAmt >= 0 ? "border-up/20 bg-up-bg/20 text-up hover:border-up/40" : "border-down/20 bg-down-bg/20 text-down hover:border-down/40"
                }`}>
                <span className="font-bold">{s.symbol.replace(/\d+/g, "")}</span>
                <span className="tabular-nums text-[10px]">
                  {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                </span>
                <span className="text-[9px] text-muted">
                  B:{num(s.buyQty)} S:{num(s.sellQty)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Shared Components ─── */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
