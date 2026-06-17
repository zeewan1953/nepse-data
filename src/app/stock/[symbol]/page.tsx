"use client";
import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SecurityResponse } from "@/lib/types";
import { generateSignal, type Candle, type Signal } from "@/lib/signals";
import { breakout, type Breakout } from "@/tactical-analysis/calculation/breakout";
import { npr, num, compact, pct, changeClass } from "@/lib/format";
import { generateNepaliAnalysis } from "@/lib/nepaliAnalysis";

export default function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const sym = decodeURIComponent(symbol).toUpperCase();

  const [data, setData] = useState<SecurityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/security/${encodeURIComponent(sym)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) setError(j?.error ?? "Failed to load");
        else setData(j as SecurityResponse);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sym]);

  const daily = data?.details?.securityDailyTradeDto;
  const sorted = useMemo(
    () => [...(data?.history?.content ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate)),
    [data],
  );
  const candles: Candle[] = useMemo(
    () => sorted.map((c) => ({ high: c.highPrice, low: c.lowPrice, close: c.closePrice, volume: c.totalTradedQuantity })),
    [sorted],
  );
  const last = sorted.at(-1); // latest session candle (full row)

  // Merge live day stats with the last history candle so the "Today" panel is
  // populated even when the market is closed (securityDailyTradeDto is empty).
  const day = {
    openPrice: daily?.openPrice || last?.openPrice,
    highPrice: daily?.highPrice || last?.highPrice,
    lowPrice: daily?.lowPrice || last?.lowPrice,
    previousClose: daily?.previousClose || last?.previousDayClosePrice,
    totalTradeQuantity: daily?.totalTradeQuantity || last?.totalTradedQuantity,
    totalTrades: daily?.totalTrades || last?.totalTrades,
    fiftyTwoWeekHigh: daily?.fiftyTwoWeekHigh || last?.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: daily?.fiftyTwoWeekLow || last?.fiftyTwoWeekLow,
  };

  const ltp = daily?.lastTradedPrice || last?.lastTradedPrice || last?.closePrice || 0;
  const prevClose = day.previousClose ?? candles.at(-2)?.close ?? 0;
  const change = ltp - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const signal: Signal | null = useMemo(
    () => (candles.length ? generateSignal(candles, ltp) : null),
    [candles, ltp],
  );
  const brk: Breakout | null = useMemo(
    () => (candles.length ? breakout(candles, ltp) : null),
    [candles, ltp],
  );

  // Local AI analysis — no external API needed
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);

  const day52High = day.fiftyTwoWeekHigh ?? null;
  const day52Low = day.fiftyTwoWeekLow ?? null;
  const securityName = data?.details?.security?.securityName ?? sym;

  const runAnalysis = useCallback(() => {
    if (!signal) return;
    const text = generateNepaliAnalysis(sym, securityName, ltp, signal, day52High, day52Low);
    setAiText(text);
    setAiVisible(true);
  }, [sym, securityName, ltp, signal, day52High, day52Low]);

  return (
    <div className="space-y-5">
      <Link href="/market" className="text-sm text-primary hover:underline">
        ← Market Watch
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-foreground">{sym}</h1>
          <p className="text-sm text-muted">
            {data?.details?.security?.securityName ?? (loading ? "Loading…" : "")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold tabular-nums">{npr(ltp)}</div>
          <div className={`text-sm font-semibold tabular-nums ${changeClass(change)}`}>
            {change > 0 ? "+" : ""}
            {npr(change)} ({pct(changePct)})
          </div>
        </div>
      </div>

      {error && !data && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="text-4xl">🔍</div>
          <p className="mt-3 font-semibold text-foreground">{error}</p>
          <p className="mt-1 text-sm text-muted">
            Yo symbol NEPSE ma trade nahune / delisted hunasakcha. Market bata arko stock rojnus.
          </p>
          <Link
            href="/market"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            ← Market Watch
          </Link>
        </div>
      )}

      {/* Breakout signal (daily) */}
      {brk && (
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-bold">⚡ Breakout Signal — {sym}</h2>
            <span
              className={`rounded-full px-3 py-1 text-sm font-extrabold ${
                brk.signal === "BUY"
                  ? "bg-up text-white"
                  : brk.signal === "SELL"
                    ? "bg-down text-white"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {brk.signal}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-3">
            <BRow label="Buy Zone" v={brk.buyZone ? `${npr(brk.buyZone[0])} – ${npr(brk.buyZone[1])}` : "-"} cls="text-up" />
            <BRow label="Sell Zone" v={brk.sellZone ? `${npr(brk.sellZone[0])} – ${npr(brk.sellZone[1])}` : "-"} cls="text-down" />
            <BRow label="Entry" v={npr(brk.entry)} />
            <BRow label="SL" v={npr(brk.sl)} cls="text-down" />
            <BRow label="TP1" v={npr(brk.tp1)} cls="text-up" />
            <BRow label="TP2" v={npr(brk.tp2)} cls="text-up" />
            <BRow label="TP3" v={npr(brk.tp3)} cls="text-up" />
            <BRow label="Confidence" v={`${brk.confidence}%`} />
          </div>
        </section>
      )}

      {/* AI Signals Panel */}
      {signal && (
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-bold">🎯 Signals — {sym}</h2>
            <RecoBadge reco={signal.recommendation} />
          </div>

          <div className="space-y-4 p-4">
            {/* Confidence bar */}
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                <span>Weighted Confidence ({signal.factors.filter(f => f.verdict === "Bullish").length}B / {signal.factors.filter(f => f.verdict === "Bearish").length}S)</span>
                <span>{signal.confidence}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${signal.confidence}%`,
                    background:
                      signal.confidence >= 58 ? "var(--up)"
                      : signal.confidence >= 42 ? "var(--accent)"
                      : "var(--down)",
                  }}
                />
              </div>
            </div>

            {/* ATR-based price levels */}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">ATR-Based Levels{signal.atr !== null ? ` (ATR ≈ ${signal.atr})` : ""}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Level label="ATR Stop Loss" value={signal.atrStopLoss !== null ? npr(signal.atrStopLoss) : npr(signal.stopLoss)} tone="down" />
                <Level label="Target 1 (1:1)" value={signal.atrTarget1 !== null ? npr(signal.atrTarget1) : npr(signal.target1)} tone="up" />
                <Level label="Target 2 (1:2)" value={signal.atrTarget2 !== null ? npr(signal.atrTarget2) : npr(signal.target2)} tone="up" />
                <Level label="Target 3 (1:3)" value={signal.atrTarget3 !== null ? npr(signal.atrTarget3) : (signal.target3 !== undefined ? npr(signal.target3) : "-")} tone="up" />
              </div>
            </div>

            {/* Moving averages row */}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Moving Averages</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MALevel label="EMA 20" value={signal.ema20} ltp={ltp} />
                <MALevel label="SMA 50" value={signal.sma50} ltp={ltp} />
                <MALevel label="SMA 200" value={signal.sma200} ltp={ltp} />
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">TMA/DMA Cross</div>
                  <div className={`mt-0.5 font-bold ${
                    signal.tmaDmaCross === "golden" ? "text-up"
                    : signal.tmaDmaCross === "death" ? "text-down"
                    : signal.tmaDmaCross === "bullish" ? "text-up"
                    : signal.tmaDmaCross === "bearish" ? "text-down"
                    : ""
                  }`}>
                    {signal.tmaDmaCross === "golden" ? "⭐ Golden Cross"
                      : signal.tmaDmaCross === "death" ? "💀 Death Cross"
                      : signal.tmaDmaCross === "bullish" ? "▲ Bullish Zone"
                      : signal.tmaDmaCross === "bearish" ? "▼ Bearish Zone"
                      : "—"}
                  </div>
                  {signal.tmaValue !== null && <div className="text-[10px] text-muted">TMA {npr(signal.tmaValue)}</div>}
                </div>
              </div>
            </div>

            {/* Momentum row */}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Momentum</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">RSI 14</div>
                  <div className={`mt-0.5 font-bold tabular-nums ${
                    signal.rsi === null ? ""
                    : signal.rsi < 30 ? "text-up"
                    : signal.rsi > 70 ? "text-down"
                    : signal.rsi > 55 ? "text-up"
                    : signal.rsi < 45 ? "text-down"
                    : "text-muted"
                  }`}>
                    {signal.rsi !== null ? signal.rsi.toFixed(0) : "—"}
                  </div>
                  {signal.rsi !== null && (
                    <div className="text-[10px] text-muted">
                      {signal.rsi < 30 ? "Oversold" : signal.rsi > 70 ? "Overbought" : signal.rsi > 55 ? "Bullish" : signal.rsi < 45 ? "Bearish" : "Neutral"}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">MACD</div>
                  <div className={`mt-0.5 font-bold tabular-nums ${signal.macd ? (signal.macd.hist >= 0 ? "text-up" : "text-down") : ""}`}>
                    {signal.macd ? (signal.macd.hist >= 0 ? "Bullish" : "Bearish") : "—"}
                  </div>
                  {signal.macd && <div className="text-[10px] text-muted">Hist {signal.macd.hist.toFixed(2)}</div>}
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Parabolic SAR</div>
                  <div className={`mt-0.5 font-bold ${ signal.sar?.bullish ? "text-up" : "text-down" }`}>
                    {signal.sar ? (signal.sar.bullish ? "▼ Bull" : "▲ Bear") : "—"}
                  </div>
                  {signal.sar && <div className="text-[10px] text-muted">{npr(signal.sar.sar)}</div>}
                </div>
                <Level
                  label="VWAP"
                  value={signal.vwap !== null ? `${signal.vwap > ltp ? "▼ Below" : "▲ Above"} ${npr(signal.vwap)}` : "—"}
                  tone={signal.vwap !== null ? (ltp > signal.vwap ? "up" : "down") : undefined}
                />
              </div>
            </div>

            {/* Support / resistance */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-muted">Support <b className="text-up">{npr(signal.support)}</b></span>
              <span className="text-muted">Resistance <b className="text-down">{npr(signal.resistance)}</b></span>
              {signal.riskReward !== null && <span className="text-muted">Risk:Reward <b className="text-foreground">1:{signal.riskReward}</b></span>}
              {signal.week52Position !== null && <span className="text-muted">52W Position <b className="text-foreground">{signal.week52Position}%</b></span>}
            </div>

            {/* Summary */}
            <p className="rounded-lg bg-surface-2 p-3 text-sm">{signal.summary}</p>

            {/* Deep analysis factors */}
            {signal.factors.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Deep Analysis — {signal.factors.length} indicators (weighted)
                </div>
                {signal.factors.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <b>{f.category}</b>
                      {f.weight !== undefined && <span className="ml-1 text-[10px] text-muted">(w={f.weight})</span>}
                      {"  "}{f.note}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        f.verdict === "Bullish" ? "bg-up-bg text-up"
                        : f.verdict === "Bearish" ? "bg-down-bg text-down"
                        : "bg-surface text-muted"
                      }`}
                    >
                      {f.verdict}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted">
              Technical signal for education only — not financial advice. Verify before trading.
            </p>
          </div>
        </section>
      )}

      {/* AI Nepali Analysis — Local, No API */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-bold">🤖 विश्लेषण — {sym}</h2>
          <button
            onClick={runAnalysis}
            disabled={!signal}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-50"
          >
            {aiText ? "फेरि गर्नुस्" : "आजको विश्लेषण गर्नुस्"}
          </button>
        </div>

        {!aiText && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted">
            <span className="text-3xl">🏹</span>
            <p className="text-sm">उपरि बटन दबाउनुस् — {sym} को सम्पूर्ण तकनिकल विश्लेषण नेपालीमा देखिनेछ।</p>
            <p className="text-xs text-muted">(13 indicators को local analysis — कुनै AI API चाहिँदैन)</p>
          </div>
        )}

        {aiText && (
          <div className="p-4">
            <AiMarkdown text={aiText} />
          </div>
        )}

        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
          विश्लेषण शिक्षाको लागि मात्र — लगानी गर्नुभन्दा आफैं विषेशज्ञसंग सलाह लिनुहोस्। Not financial advice.
        </p>
      </section>

      {/* Day stats + depth */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-3 font-bold">Today</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Open" v={npr(day.openPrice)} />
            <Row label="High" v={npr(day.highPrice)} cls="text-up" />
            <Row label="Low" v={npr(day.lowPrice)} cls="text-down" />
            <Row label="Prev Close" v={npr(day.previousClose)} />
            <Row label="Volume" v={num(day.totalTradeQuantity)} />
            <Row label="Trades" v={num(day.totalTrades)} />
            <Row label="52W High" v={npr(day.fiftyTwoWeekHigh)} />
            <Row label="52W Low" v={npr(day.fiftyTwoWeekLow)} />
            <Row label="Market Cap" v={compact(data?.details?.marketCapitalization)} />
            <Row label="Listed Shares" v={num(data?.details?.stockListedShares)} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-3 font-bold">Order Book (Depth)</h3>
          <DepthTable data={data} />
        </div>
      </div>
    </div>
  );
}

function RecoBadge({ reco }: { reco: Signal["recommendation"] }) {
  const tone =
    reco.includes("Buy") ? "bg-up-bg text-up" : reco.includes("Sell") ? "bg-down-bg text-down" : "bg-surface-2 text-muted";
  return <span className={`rounded-full px-3 py-1 text-sm font-bold ${tone}`}>{reco}</span>;
}

function Level({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 font-bold tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MALevel({ label, value, ltp }: { label: string; value: number | null; ltp: number }) {
  const tone = value === null ? "" : ltp > value ? "text-up" : "text-down";
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${tone}`}>
        {value !== null ? npr(value) : "—"}
      </div>
      {value !== null && (
        <div className={`text-[10px] ${tone}`}>
          {ltp > value ? "Price above" : "Price below"}
        </div>
      )}
    </div>
  );
}

function AiMarkdown({ text }: { text: string }) {
  // Render the streamed markdown-like text with basic formatting:
  // **bold**, headings (##/###), horizontal rules (---), bullet lists
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return <h3 key={i} className="mt-3 font-bold text-foreground">{renderInline(line.slice(4))}</h3>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={i} className="mt-4 text-base font-extrabold text-foreground">{renderInline(line.slice(3))}</h2>;
        }
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return <p key={i} className="font-bold text-foreground">{line.slice(2, -2)}</p>;
        }
        if (/^[-*] /.test(line)) {
          return <li key={i} className="ml-4 list-disc">{renderInline(line.slice(2))}</li>;
        }
        if (/^---+$/.test(line.trim())) {
          return <hr key={i} className="border-border my-2" />;
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  );
}

function Row({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

function BRow({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-bold tabular-nums ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

function DepthTable({ data }: { data: SecurityResponse | null }) {
  const buys = data?.depth?.marketDepth?.buyMarketDepthList ?? [];
  const sells = data?.depth?.marketDepth?.sellMarketDepthList ?? [];
  if (!buys.length && !sells.length)
    return <p className="text-sm text-muted">No depth data (market closed?).</p>;
  const rows = Math.max(buys.length, sells.length);
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase text-muted">
        <tr>
          <th className="px-2 py-1 text-left text-up">Buy Qty</th>
          <th className="px-2 py-1 text-right text-up">Buy Price</th>
          <th className="px-2 py-1 text-left text-down">Sell Price</th>
          <th className="px-2 py-1 text-right text-down">Sell Qty</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="border-t border-border">
            <td className="px-2 py-1 tabular-nums text-up">{buys[i] ? num(buys[i].quantity) : ""}</td>
            <td className="px-2 py-1 text-right tabular-nums">{buys[i] ? npr(buys[i].orderBookOrderPrice) : ""}</td>
            <td className="px-2 py-1 tabular-nums">{sells[i] ? npr(sells[i].orderBookOrderPrice) : ""}</td>
            <td className="px-2 py-1 text-right tabular-nums text-down">{sells[i] ? num(sells[i].quantity) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
