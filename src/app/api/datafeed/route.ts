import { getIntradayCandles, getCandlesFromDb } from "@/lib/db";
import { getNepse, cached, safeNepseCall, resolveSecurityId, getPriceHistoryById } from "@/lib/nepse";
import { getAllStocks, searchStocks } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TradingView Charting Library Datafeed API
 * 
 * Handles all TradingView datafeed requests:
 * - GET /api/datafeed?type=config  → Supported resolutions & exchanges
 * - GET /api/datafeed?type=symbols → Symbol info
 * - GET /api/datafeed?type=search  → Symbol search
 * - GET /api/datafeed?type=history → OHLCV candles
 * - GET /api/datafeed?type=time    → Server time
 */

// Supported resolutions
const SUPPORTED_RESOLUTIONS = ["1", "5", "15", "30", "60", "240", "D", "W", "M"];

// NEPSE exchange info
const EXCHANGE = "NEPSE";
const TIMEZONE = "Asia/Kathmandu";
const CURRENCY = "NPR";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  switch (type) {
    case "config":
      return handleConfig();
    case "symbols":
      return handleSymbols(url);
    case "search":
      return handleSearch(url);
    case "history":
      return handleHistory(url);
    case "time":
      return handleTime();
    default:
      return Response.json({ error: "Invalid datafeed type" }, { status: 400 });
  }
}

// ─── /config ──────────────────────────────────────────────────────────────
function handleConfig() {
  return Response.json({
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    exchanges: [
      { value: EXCHANGE, name: EXCHANGE, desc: "Nepal Stock Exchange" },
    ],
    symbols_types: [
      { name: "stock", value: "stock" },
      { name: "index", value: "index" },
    ],
    supports_marks: false,
    supports_time: true,
    supports_timescale_marks: false,
  });
}

// ─── /symbols ─────────────────────────────────────────────────────────────
async function handleSymbols(url: URL) {
  const symbol = (url.searchParams.get("symbol") ?? "NEPSE").toUpperCase();

  if (symbol === "NEPSE" || symbol === "NEPSE INDEX") {
    return Response.json({
      name: "NEPSE",
      full_name: `NEPSE:NEPSE`,
      description: "NEPSE Index",
      type: "index",
      exchange: EXCHANGE,
      listed_exchange: EXCHANGE,
      timezone: TIMEZONE,
      format: "price",
      currency_code: CURRENCY,
      pricescale: 100,
      minmov: 1,
      has_intraday: true,
      intraday_multipliers: ["1", "5", "15", "30", "60"],
      has_daily: true,
      has_weekly_and_monthly: true,
      volume_precision: 0,
      session: "1030-1500",
    });
  }

  // Individual stock
  try {
    const allStocks = await getAllStocks();
    const stock = allStocks.find(s => s.symbol === symbol);
    if (stock) {
      return Response.json({
        name: stock.symbol,
        full_name: `${EXCHANGE}:${stock.symbol}`,
        description: stock.name || stock.symbol,
        type: "stock",
        exchange: EXCHANGE,
        listed_exchange: EXCHANGE,
        timezone: TIMEZONE,
        format: "price",
        currency_code: CURRENCY,
        pricescale: 100,
        minmov: 1,
        has_intraday: true,
        intraday_multipliers: ["1", "5", "15", "30", "60"],
        has_daily: true,
        has_weekly_and_monthly: true,
        volume_precision: 0,
        session: "1030-1500",
      });
    }
  } catch { /* ignore */ }

  return Response.json({ error: "Symbol not found" }, { status: 404 });
}

// ─── /search ──────────────────────────────────────────────────────────────
async function handleSearch(url: URL) {
  const query = url.searchParams.get("query") ?? "";
  const limit = parseInt(url.searchParams.get("limit") ?? "30");

  const results: Array<{
    symbol: string;
    full_name: string;
    description: string;
    exchange: string;
    type: string;
  }> = [];

  // Always include NEPSE Index
  if ("NEPSE".includes(query.toUpperCase()) || !query) {
    results.push({
      symbol: "NEPSE",
      full_name: `${EXCHANGE}:NEPSE`,
      description: "NEPSE Index",
      exchange: EXCHANGE,
      type: "index",
    });
  }

  // Search stocks
  try {
    const stocks = await searchStocks(query);
    for (const s of stocks.slice(0, limit)) {
      results.push({
        symbol: s.symbol,
        full_name: `${EXCHANGE}:${s.symbol}`,
        description: s.name || s.symbol,
        exchange: EXCHANGE,
        type: "stock",
      });
    }
  } catch { /* ignore */ }

  return Response.json(results.slice(0, limit));
}

// ─── /history ─────────────────────────────────────────────────────────────
async function handleHistory(url: URL) {
  const symbol = (url.searchParams.get("symbol") ?? "NEPSE").toUpperCase();
  const resolution = url.searchParams.get("resolution") ?? "D";
  const from = parseInt(url.searchParams.get("from") ?? "0");
  const to = parseInt(url.searchParams.get("to") ?? "0");

  // Intraday resolutions
  if (["1", "5", "15", "30", "60", "240"].includes(resolution)) {
    // Try intraday_candles table first
    try {
      const candles = await getIntradayCandles(symbol, from, to, 2000);
      if (candles.length > 0) {
        return Response.json({
          s: "ok",
          t: candles.map(c => c.ts),
          o: candles.map(c => c.open),
          h: candles.map(c => c.high),
          l: candles.map(c => c.low),
          c: candles.map(c => c.close),
          v: candles.map(c => c.volume),
        });
      }
    } catch { /* no intraday data */ }

    // Fallback: NEPSE index graph for intraday
    if (symbol === "NEPSE" || symbol === "NEPSE INDEX") {
      try {
        const points = await cached("index-graph-df", 15_000, () =>
          safeNepseCall(() => getNepse().getNepseIndexDailyGraph(), "Index graph DF"),
        );
        if (Array.isArray(points) && points.length >= 2) {
          const sec = parseInt(resolution) * 60;
          const filtered = (points as [number, number][]).filter(
            ([t]) => (!from || t >= from) && (!to || t <= to),
          );
          if (filtered.length >= 2) {
            const bk = new Map<number, { o: number; h: number; l: number; c: number }>();
            for (const [t, v] of filtered) {
              const b = Math.floor(t / sec) * sec;
              const cur = bk.get(b);
              if (!cur) bk.set(b, { o: v, h: v, l: v, c: v });
              else { cur.h = Math.max(cur.h, v); cur.l = Math.min(cur.l, v); cur.c = v; }
            }
            const sorted = [...bk.entries()].sort((a, b) => a[0] - b[0]);
            return Response.json({
              s: "ok",
              t: sorted.map(([t]) => t),
              o: sorted.map(([, v]) => v.o),
              h: sorted.map(([, v]) => v.h),
              l: sorted.map(([, v]) => v.l),
              c: sorted.map(([, v]) => v.c),
              v: sorted.map(() => 0),
            });
          }
        }
      } catch { /* NEPSE unreachable */ }
    }

    return Response.json({ s: "no_data", t: [], o: [], h: [], l: [], c: [], v: [] });
  }

  // Daily/Weekly/Monthly
  if (["D", "W", "M"].includes(resolution)) {
    // Try daily OHLCV from DB
    const dailyCandles = await getCandlesFromDb(symbol, 2000);
    if (dailyCandles.length > 0) {
      const filtered = dailyCandles.filter(c => {
        const ts = Math.floor(new Date(c.tradeDate).getTime() / 1000);
        return (!from || ts >= from) && (!to || ts <= to);
      });
      if (filtered.length > 0) {
        return Response.json({
          s: "ok",
          t: filtered.map(c => Math.floor(new Date(c.tradeDate).getTime() / 1000)),
          o: filtered.map(c => c.open),
          h: filtered.map(c => c.high),
          l: filtered.map(c => c.low),
          c: filtered.map(c => c.close),
          v: filtered.map(c => c.volume),
        });
      }
    }

    // Fallback: NEPSE API for daily history
    try {
      const id = await resolveSecurityId(symbol);
      if (id) {
        const history = await cached(`df-hist:${symbol}`, 30_000, () =>
          safeNepseCall(() => getPriceHistoryById(id, 2000), `DF History ${symbol}`),
        );
        const content = (history as any)?.content ?? [];
        if (content.length > 0) {
          const sorted = content.slice().sort((a: any, b: any) =>
            a.businessDate.localeCompare(b.businessDate),
          );
          return Response.json({
            s: "ok",
            t: sorted.map((c: any) => Math.floor(new Date(c.businessDate).getTime() / 1000)),
            o: sorted.map((c: any) => c.openPrice),
            h: sorted.map((c: any) => c.highPrice),
            l: sorted.map((c: any) => c.lowPrice),
            c: sorted.map((c: any) => c.closePrice),
            v: sorted.map((c: any) => c.totalTradedQuantity),
          });
        }
      }
    } catch { /* NEPSE unreachable */ }

    return Response.json({ s: "no_data", t: [], o: [], h: [], l: [], c: [], v: [] });
  }

  return Response.json({ s: "error", errmsg: `Unsupported resolution: ${resolution}` });
}

// ─── /time ────────────────────────────────────────────────────────────────
function handleTime() {
  return Response.json({ time: Math.floor(Date.now() / 1000) });
}
