import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import { getMarketSession, getNPTNow } from "@/lib/market-hours";
import { saveIntradayCandles, getIntradayCandles, type IntradayCandle } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Candle Aggregator ─────────────────────────────────────────────────────
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

class CandleAggregator {
  private candles: Candle[] = [];
  private current: Candle | null = null;
  private intervalSec: number;

  constructor(intervalMin = 5, maxHistory = 200) {
    this.intervalSec = intervalMin * 60;
    // keep only last maxHistory candles
    this.candles = [];
  }

  addTick(price: number, volume: number, ts: number): Candle | null {
    if (price <= 0) return null;
    const bucket = Math.floor(ts / this.intervalSec) * this.intervalSec;

    if (!this.current || bucket > this.current.t) {
      // New candle period
      if (this.current) this.candles.push(this.current);
      // Trim history
      if (this.candles.length > 200) this.candles = this.candles.slice(-200);
      this.current = { t: bucket, o: price, h: price, l: price, c: price, v: volume };
      return { ...this.current };
    }

    // Same candle period — update
    this.current.h = Math.max(this.current.h, price);
    this.current.l = Math.min(this.current.l, price);
    this.current.c = price;
    this.current.v += volume;
    return null; // no new candle closed
  }

  getHistory(): Candle[] {
    const all = this.current ? [...this.candles, this.current] : [...this.candles];
    return all.slice(-120);
  }
}

// ─── SSE helpers ───────────────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Global 1-min candle buffer (shared across connections) ────────────────
// symbol → Map<bucket_ts, Candle>
const GLOBAL_CANDLES = new Map<string, Map<number, Candle>>();
let lastDbFlush = 0;
const DB_FLUSH_INTERVAL = 60_000; // flush to DB every 60s

function updateGlobalCandle(symbol: string, price: number, volume: number, ts: number): Candle {
  if (!GLOBAL_CANDLES.has(symbol)) GLOBAL_CANDLES.set(symbol, new Map());
  const map = GLOBAL_CANDLES.get(symbol)!;
  const bucket = Math.floor(ts / 60) * 60; // 1-min buckets
  const existing = map.get(bucket);
  if (!existing) {
    const c = { t: bucket, o: price, h: price, l: price, c: price, v: volume };
    map.set(bucket, c);
    // Trim: keep last 500 candles per symbol
    if (map.size > 500) {
      const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
      map.clear();
      sorted.slice(-500).forEach(([k, v]) => map.set(k, v));
    }
    return { ...c };
  }
  existing.h = Math.max(existing.h, price);
  existing.l = Math.min(existing.l, price);
  existing.c = price;
  existing.v += volume;
  return { ...existing };
}

async function flushCandlesToDb(): Promise<void> {
  const now = Date.now();
  if (now - lastDbFlush < DB_FLUSH_INTERVAL) return;
  lastDbFlush = now;
  for (const [symbol, map] of GLOBAL_CANDLES) {
    if (map.size === 0) continue;
    const candles: IntradayCandle[] = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-100)
      .map(([, c]) => ({ ts: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }));
    try {
      await saveIntradayCandles(symbol, candles);
    } catch { /* DB write failure, continue */ }
  }
}

// ─── NEPSE Index Calculator ────────────────────────────────────────────────
// Computes a price-weighted index from top stocks by market cap proxy (lp * qty)
function computeIndexValue(stocks: Array<{ lp: number; q: number; prevClose: number }>): number {
  // Use simple average of % changes applied to base index ~2700
  const BASE_INDEX = 2700;
  const active = stocks.filter((s) => s.lp > 0 && s.prevClose > 0);
  if (active.length === 0) return BASE_INDEX;
  let totalPctChange = 0;
  let weight = 0;
  for (const s of active) {
    const pctChg = ((s.lp - s.prevClose) / s.prevClose) * 100;
    const w = Math.sqrt(s.q); // volume-weighted
    totalPctChange += pctChg * w;
    weight += w;
  }
  const avgPct = weight > 0 ? totalPctChange / weight : 0;
  return Math.round((BASE_INDEX * (1 + avgPct / 100)) * 100) / 100;
}

// ─── Main SSE handler ──────────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "NEPSE").toUpperCase();
  const intervalMin = Math.min(60, Math.max(1, parseInt(url.searchParams.get("interval") ?? "5")));

  const encoder = new TextEncoder();
  const aggregator = new CandleAggregator(intervalMin);

  // Previous prices for change detection
  const prevPrices = new Map<string, number>();

  const stream = new ReadableStream({
    async start(controller) {
      let alive = true;
      const abortHandler = () => { alive = false; };
      req.signal.addEventListener("abort", abortHandler);

      // Send initial connection event
      controller.enqueue(encoder.encode(sseEvent("connected", {
        symbol, interval: intervalMin, ts: Date.now(),
      })));

      const poll = async () => {
        while (alive) {
          const session = getMarketSession(getNPTNow());
          let pollDelay = 10_000; // default 10s
          if (session === "closed") pollDelay = 60_000; // 1 min when closed
          else if (session === "pre-open") pollDelay = 30_000; // 30s pre-open

          try {
            const mero = await fetchMeroLaganiSummary();
            if (!mero?.stock?.detail?.length) {
              controller.enqueue(encoder.encode(sseEvent("status", {
                market: session, message: "No data from source", ts: Date.now(),
              })));
              await sleep(pollDelay);
              continue;
            }

            const now = Math.floor(Date.now() / 1000);

            if (symbol === "NEPSE" || symbol === "NEPSE INDEX") {
              // Compute index from all stocks
              const stockData = mero.stock.detail.map((s) => ({
                lp: s.lp, q: s.q, prevClose: s.lp - s.c,
              }));
              const indexValue = computeIndexValue(stockData);
              const totalVol = mero.stock.detail.reduce((sum, s) => sum + s.q, 0);

              // Tick event
              controller.enqueue(encoder.encode(sseEvent("tick", {
                symbol: "NEPSE", price: indexValue, volume: totalVol, ts: now,
                market: session,
              })));

              // Update global 1-min candles (auto-collector)
              updateGlobalCandle("NEPSE", indexValue, totalVol, now);

              // Candle aggregation (for display interval)
              const newCandle = aggregator.addTick(indexValue, totalVol, now);
              if (newCandle) {
                controller.enqueue(encoder.encode(sseEvent("candle", newCandle)));
              }

              // Also update global candles for all stocks
              for (const s of mero.stock.detail) {
                if (s.lp > 0 && s.q > 0) {
                  updateGlobalCandle(s.s, s.lp, s.q, now);
                }
              }

              // Send full history on first successful poll
              if (prevPrices.size === 0) {
                // Try DB first, then aggregator
                const dbCandles = await getIntradayCandles("NEPSE", undefined, undefined, 500);
                if (dbCandles.length > 0) {
                  controller.enqueue(encoder.encode(sseEvent("history", dbCandles.map(c => ({
                    t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
                  })))));
                } else {
                  const history = aggregator.getHistory();
                  if (history.length > 0) {
                    controller.enqueue(encoder.encode(sseEvent("history", history)));
                  }
                }
              }

              // Periodic flush to DB
              await flushCandlesToDb();

              // Update previous prices
              for (const s of mero.stock.detail) {
                prevPrices.set(s.s, s.lp);
              }

            } else {
              // Individual stock
              const stock = mero.stock.detail.find((s) => s.s === symbol);
              if (stock && stock.lp > 0) {
                const prevClose = stock.lp - stock.c;
                const pct = calcMeroPercent(stock);

                // Tick event
                controller.enqueue(encoder.encode(sseEvent("tick", {
                  symbol, price: stock.lp, volume: stock.q, ts: now,
                  market: session, change: stock.c, pctChange: pct, prevClose,
                })));

                // Update global 1-min candles
                updateGlobalCandle(symbol, stock.lp, stock.q, now);

                // Candle aggregation (display interval)
                const newCandle = aggregator.addTick(stock.lp, stock.q, now);
                if (newCandle) {
                  controller.enqueue(encoder.encode(sseEvent("candle", newCandle)));
                }

                // Send history on first poll
                if (prevPrices.size === 0) {
                  const dbCandles = await getIntradayCandles(symbol, undefined, undefined, 500);
                  if (dbCandles.length > 0) {
                    controller.enqueue(encoder.encode(sseEvent("history", dbCandles.map(c => ({
                      t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
                    })))));
                  } else {
                    const history = aggregator.getHistory();
                    if (history.length > 0) {
                      controller.enqueue(encoder.encode(sseEvent("history", history)));
                    }
                  }
                }

                prevPrices.set(symbol, stock.lp);

                // Also emit top movers for context
                if (prevPrices.size < 5) {
                  const sorted = [...mero.stock.detail]
                    .filter((s) => s.lp > 0)
                    .sort((a, b) => calcMeroPercent(b) - calcMeroPercent(a));
                  const gainers = sorted.slice(0, 3).map((s) => ({
                    symbol: s.s, price: s.lp, pct: calcMeroPercent(s),
                  }));
                  const losers = sorted.slice(-3).reverse().map((s) => ({
                    symbol: s.s, price: s.lp, pct: calcMeroPercent(s),
                  }));
                  controller.enqueue(encoder.encode(sseEvent("movers", { gainers, losers })));
                }
              } else {
                controller.enqueue(encoder.encode(sseEvent("status", {
                  market: session, message: `Symbol ${symbol} not found`, ts: Date.now(),
                })));
              }
            }

          } catch (e) {
            controller.enqueue(encoder.encode(sseEvent("error", {
              message: (e as Error).message ?? "Poll error", ts: Date.now(),
            })));
          }

          // Status event
          controller.enqueue(encoder.encode(sseEvent("status", {
            market: session, ts: Date.now(),
          })));

          await sleep(pollDelay);
        }

        req.signal.removeEventListener("abort", abortHandler);
        try { controller.close(); } catch { /* already closed */ }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx proxy compat
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
