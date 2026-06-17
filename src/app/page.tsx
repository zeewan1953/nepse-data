"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus, NepseIndex, NepseSubIndex, TopTenItem } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, changeClass, num } from "@/lib/format";

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
  const status = usePoll<MarketStatus>("/api/market-status", 2_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const interval = 2_000;
  const indices = usePoll<IndicesResp>("/api/indices", interval);
  const movers = usePoll<MoversResp>("/api/movers", interval);
  const signals = usePoll<SignalsResp>("/api/signals", open ? 5 * 60_000 : 10 * 60_000);
  const news = usePoll<NewsResp>("/api/news", 2_000);
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
  const breakouts = allSignals.filter((s) => s.breakout && s.breakout.signal !== "WAIT");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-black text-foreground">DARI SIR</h1>
          <p className="text-sm text-muted">Nepal Stock Exchange — live dashboard</p>
        </div>
        <StockSearch liveData={live.data ?? undefined} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {nepse && (
          <IndexCard name="NEPSE" value={(nepse as any).currentValue ?? (nepse as any).close} change={(nepse as any).change ?? (nepse as any).points ?? 0} perChange={(nepse as any).perChange ?? (nepse as any).percentage ?? 0} />
        )}
        {(indices.data?.subIndices ?? []).slice(0, 11).map((s) => {
          const value = (s as any).currentValue ?? (s as any).close ?? 0;
          const change = (s as any).change ?? (s as any).points ?? 0;
          const perChange = (s as any).perChange ?? (s as any).percentage ?? 0;
          return (
            <IndexCard key={s.index} name={s.index.replace(" Index", "")} value={value} change={change} perChange={perChange} />
          );
        })}
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
};
type SecData = {
  details: { securityDailyTradeDto?: { openPrice: number; highPrice: number; lowPrice: number; previousClose: number; lastTradedPrice: number; fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number; totalTradeQuantity: number; marketCap: number }; securityPriceVolumeDto?: { paidUpValue: number; totalPaidupCapital: string } } | null;
  history: { content: { businessDate: string; closePrice: number; highPrice: number; lowPrice: number; totalTradedQuantity: number }[] } | null;
};

function StockPopup({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "fundamental" | "signals" | "broker">("overview");
  const [fund, setFund] = useState<FundData | null>(null);
  const [sec, setSec] = useState<SecData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/fundamental-external/${encodeURIComponent(symbol)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/security/${encodeURIComponent(symbol)}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([f, s]) => {
      setFund(f);
      setSec(s);
      setLoading(false);
    });
  }, [symbol]);

  // Compute AI signal from history
  const signalInfo = useMemo(() => {
    if (!sec?.history?.content?.length) return null;
    const candles = [...sec.history.content].sort((a, b) => a.businessDate.localeCompare(b.businessDate)).slice(-100);
    const ltp = sec.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.closePrice ?? 0;
    const prev = sec.details?.securityDailyTradeDto?.previousClose ?? candles.at(-2)?.closePrice ?? 0;
    const change = ltp - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    // Simple signal: count bullish/bearish indicators
    let bull = 0, bear = 0;
    const last5 = candles.slice(-5);
    for (const c of last5) { if (c.closePrice > c.lowPrice * 1.01) bull++; else bear++; }
    const ema20 = candles.slice(-20).reduce((s, c) => s + c.closePrice, 0) / Math.min(20, candles.length);
    if (ltp > ema20) bull++; else bear++;
    const overall = bull > bear ? "BUY" : bull < bear ? "SELL" : "HOLD";
    const conf = Math.round((Math.max(bull, bear) / (bull + bear)) * 100);
    return { ltp, change, changePct, bull, bear, overall, conf, ema20 };
  }, [sec]);

  // Compute breakout
  const breakoutInfo = useMemo(() => {
    if (!sec?.history?.content?.length) return null;
    const candles = [...sec.history.content].sort((a, b) => a.businessDate.localeCompare(b.businessDate)).slice(-60);
    const ltp = sec.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.closePrice ?? 0;
    const highs = candles.slice(0, -1).map(c => c.highPrice);
    const lows = candles.slice(0, -1).map(c => c.lowPrice);
    const prevHigh = Math.max(...highs);
    const prevLow = Math.min(...lows);
    const above = ltp > prevHigh;
    const below = ltp < prevLow;
    return { signal: above ? "BUY" : below ? "SELL" : "WAIT", prevHigh, prevLow, confidence: above || below ? 75 : 20 };
  }, [sec]);

  const daily = sec?.details?.securityDailyTradeDto;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-foreground">{symbol}</span>
            {signalInfo && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${signalInfo.overall === "BUY" ? "bg-up-bg text-up" : signalInfo.overall === "SELL" ? "bg-down-bg text-down" : "bg-surface-2 text-muted"}`}>
                {signalInfo.overall} {signalInfo.conf}%
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-2">
          {(["overview", "fundamental", "signals", "broker"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-[11px] font-semibold capitalize transition ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted hover:text-foreground"}`}>
              {t === "broker" ? "Broker" : t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted">Loading...</div>
          ) : tab === "overview" ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-black tabular-nums">{npr(signalInfo?.ltp ?? daily?.lastTradedPrice ?? 0)}</span>
                <span className={`text-sm font-bold ${signalInfo && signalInfo.change >= 0 ? "text-up" : "text-down"}`}>
                  {signalInfo && signalInfo.change >= 0 ? "+" : ""}{npr(signalInfo?.change ?? 0)} ({signalInfo ? pct(signalInfo.changePct) : "—"})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Open</span><div className="font-bold tabular-nums">{npr(daily?.openPrice)}</div></div>
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">High</span><div className="font-bold tabular-nums">{npr(daily?.highPrice)}</div></div>
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Low</span><div className="font-bold tabular-nums">{npr(daily?.lowPrice)}</div></div>
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Volume</span><div className="font-bold tabular-nums">{num(daily?.totalTradeQuantity)}</div></div>
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">52W High</span><div className="font-bold tabular-nums">{npr(daily?.fiftyTwoWeekHigh)}</div></div>
                <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">52W Low</span><div className="font-bold tabular-nums">{npr(daily?.fiftyTwoWeekLow)}</div></div>
              </div>
              <Link href={`/stock/${encodeURIComponent(symbol)}`} onClick={onClose} className="block w-full rounded-lg bg-primary py-2 text-center text-xs font-semibold text-white hover:bg-primary-700">
                Full Analysis →
              </Link>
            </div>
          ) : tab === "fundamental" ? (
            <div className="space-y-3">
              {fund ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">EPS</span><div className="font-bold">{fund.eps.toFixed(2)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">PE</span><div className="font-bold">{fund.pe.toFixed(2)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">BV</span><div className="font-bold">{fund.bookValue.toFixed(2)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">PBV</span><div className="font-bold">{fund.pbv.toFixed(2)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">ROE</span><div className="font-bold">{fund.roe.toFixed(2)}%</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">D/E</span><div className="font-bold">{fund.debtEquity.toFixed(2)}</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Market Cap</span><div className="font-bold">{fund.marketCap}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><span className="text-muted">Sector</span><div className="font-bold capitalize">{fund.sector}</div></div>
                  </div>
                  {fund.dividends.length > 0 && (
                    <div className="text-xs">
                      <span className="font-semibold text-muted">Dividends:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {fund.dividends.slice(0, 5).map((d, i) => (
                          <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">{d.fiscalYear}: {d.value}%</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4 text-center text-xs text-muted">No fundamental data available</div>
              )}
            </div>
          ) : tab === "signals" ? (
            <div className="space-y-3 text-xs">
              {/* AI Signal */}
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 font-semibold text-muted">AI Signal</div>
                {signalInfo ? (
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${signalInfo.overall === "BUY" ? "bg-up-bg text-up" : signalInfo.overall === "SELL" ? "bg-down-bg text-down" : "bg-surface-2 text-muted"}`}>
                      {signalInfo.overall}
                    </span>
                    <span className="tabular-nums text-muted">Confidence: {signalInfo.conf}%</span>
                  </div>
                ) : <div className="text-muted">No data</div>}
              </div>
              {/* Breakout */}
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 font-semibold text-muted">Breakout Signal</div>
                {breakoutInfo ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${breakoutInfo.signal === "BUY" ? "bg-up-bg text-up" : breakoutInfo.signal === "SELL" ? "bg-down-bg text-down" : "bg-surface-2 text-muted"}`}>
                        {breakoutInfo.signal}
                      </span>
                      <span className="tabular-nums text-muted">{breakoutInfo.confidence}% conf</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><span className="text-muted">Resistance:</span> <span className="font-bold tabular-nums">{npr(breakoutInfo.prevHigh)}</span></div>
                      <div><span className="text-muted">Support:</span> <span className="font-bold tabular-nums">{npr(breakoutInfo.prevLow)}</span></div>
                    </div>
                  </>
                ) : <div className="text-muted">No data</div>}
              </div>
              {/* Bull/Bear count */}
              {signalInfo && (
                <div className="flex items-center justify-center gap-4 rounded-lg bg-surface-2 p-2">
                  <span className="text-up font-bold">▲ Bull {signalInfo.bull}</span>
                  <span className="text-muted">vs</span>
                  <span className="text-down font-bold">▼ Bear {signalInfo.bear}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-muted">
              Broker analysis available on the <Link href={`/stock/${encodeURIComponent(symbol)}`} onClick={onClose} className="text-primary underline">full stock page</Link>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
