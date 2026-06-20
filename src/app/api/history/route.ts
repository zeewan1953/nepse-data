import { getIntradayCandles, getCandlesFromDb } from "@/lib/db";
import { getNepse, cached, safeNepseCall, resolveSecurityId, getPriceHistoryById } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TradingView UDF (Universal Data Feed) compatible history endpoint.
 *
 * GET /api/history?symbol=NEPSE&resolution=1&from=1234&to=5678
 *
 * Response (UDF format):
 * {
 *   "s": "ok",
 *   "t": [unix_seconds, ...],
 *   "o": [open, ...],
 *   "h": [high, ...],
 *   "l": [low, ...],
 *   "c": [close, ...],
 *   "v": [volume, ...]
 * }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "NEPSE").toUpperCase();
  const resolution = url.searchParams.get("resolution") ?? "1";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const fromTs = from ? parseInt(from) : undefined;
  const toTs = to ? parseInt(to) : undefined;

  // For intraday resolutions (1, 5, 15, 30, 60 min): use intraday_candles table
  if (["1", "5", "15", "30", "60"].includes(resolution)) {
    try {
      const candles = await getIntradayCandles(symbol, fromTs, toTs, 1000);
      if (candles.length > 0) {
        return Response.json({
          s: "ok",
          t: candles.map((c) => c.ts),
          o: candles.map((c) => c.open),
          h: candles.map((c) => c.high),
          l: candles.map((c) => c.low),
          c: candles.map((c) => c.close),
          v: candles.map((c) => c.volume),
        });
      }
    } catch { /* no intraday data */ }

    // Fallback: try NEPSE index graph for intraday
    if (symbol === "NEPSE" || symbol === "NEPSE INDEX") {
      try {
        const points = await cached("index-graph-udf", 15_000, () =>
          safeNepseCall(() => getNepse().getNepseIndexDailyGraph(), "Index graph UDF"),
        );
        if (Array.isArray(points) && points.length >= 2) {
          // Filter by from/to and aggregate into resolution-min candles
          const sec = parseInt(resolution) * 60;
          const filtered = (points as [number, number][]).filter(
            ([t]) => (!fromTs || t >= fromTs) && (!toTs || t <= toTs),
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

  // For daily resolution ("D" or "1D"): use stock_daily_ohlcv + NEPSE history
  if (resolution === "D" || resolution === "1D") {
    // Try daily OHLCV from DB first
    const dailyCandles = await getCandlesFromDb(symbol, 1000);
    if (dailyCandles.length > 0) {
      const filtered = dailyCandles.filter((c) => {
        const ts = new Date(c.tradeDate).getTime() / 1000;
        return (!fromTs || ts >= fromTs) && (!toTs || ts <= toTs);
      });
      if (filtered.length > 0) {
        return Response.json({
          s: "ok",
          t: filtered.map((c) => Math.floor(new Date(c.tradeDate).getTime() / 1000)),
          o: filtered.map((c) => c.open),
          h: filtered.map((c) => c.high),
          l: filtered.map((c) => c.low),
          c: filtered.map((c) => c.close),
          v: filtered.map((c) => c.volume),
        });
      }
    }

    // Fallback: try NEPSE API for daily history
    try {
      const id = await resolveSecurityId(symbol);
      if (id) {
        const history = await cached(`history:${symbol}`, 30_000, () =>
          safeNepseCall(() => getPriceHistoryById(id, 1000), `History ${symbol}`),
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
