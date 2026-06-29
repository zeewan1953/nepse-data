import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 5;
const ALLOWED_RANGES = ["1w", "1m", "3m", "6m", "1y", "2y"] as const;
type Range = (typeof ALLOWED_RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730 };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbolsParam = searchParams.get("symbols") || "";
    const rangeParam = (searchParams.get("range") || "6m") as Range;

    if (!symbolsParam) {
      return NextResponse.json({ error: "symbols query param required (?symbols=NABIL,ADBL,SCB)" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length > MAX_SYMBOLS) {
      return NextResponse.json({ error: `Max ${MAX_SYMBOLS} symbols per request` }, { status: 400 });
    }

    if (!ALLOWED_RANGES.includes(rangeParam)) {
      return NextResponse.json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(", ")}` }, { status: 400 });
    }

    const rangeDays = RANGE_DAYS[rangeParam];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeDays);
    const startStr = startDate.toISOString().slice(0, 10);

    // Fetch OHLCV series for each symbol
    const placeholders = symbols.map(() => "?").join(",");
    const ohlcvRows = await execute(
      `SELECT symbol, tradeDate, open, high, low, close, volume
       FROM stock_daily_ohlcv
       WHERE symbol IN (${placeholders}) AND tradeDate >= ?
       ORDER BY symbol, tradeDate`,
      [...symbols, startStr]
    );

    // Group by symbol
    const seriesMap = new Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>();
    for (const r of ohlcvRows.rows as any[]) {
      const sym = r.symbol;
      if (!seriesMap.has(sym)) seriesMap.set(sym, []);
      seriesMap.get(sym)!.push({
        date: String(r.tradeDate).replace(/ .*$/, ""),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      });
    }

    // Build response: OHLCV + signals for each symbol
    const result = await Promise.all(
      symbols.map(async (sym) => {
        const series = seriesMap.get(sym) || [];

        // Fetch 8 leaderboard signals from the stock-wise endpoint's logic
        let signals: Record<string, { rawValue: number | null; signal: string | null }> = {};

        // Read from indicator_daily_signal for latest date
        const latestSignalDate = await execute(
          `SELECT MAX(trade_date) as d FROM indicator_daily_signal`
        );
        const sigDate = (latestSignalDate.rows[0] as any)?.d;
        if (sigDate) {
          const sigRows = await execute(
            `SELECT indicator_name, raw_value, signal
             FROM indicator_daily_signal
             WHERE trade_date = ? AND symbol = ?`,
            [sigDate, sym]
          );
          for (const r of sigRows.rows as any[]) {
            signals[r.indicator_name] = { rawValue: r.raw_value, signal: r.signal };
          }
        }

        // Fallback: fetch stock-wise computed signals
        if (Object.keys(signals).length === 0) {
          try {
            const swRes = await fetch(`${req.nextUrl.origin}/api/stock-wise?live=true&symbols=${sym}`);
            const swJson = await swRes.json();
            const sw = swJson.stocks?.[0];
            if (sw) {
              signals = {
                momentum_score: { rawValue: sw.momentumScore ?? null, signal: sw.momentumScore != null ? (sw.momentumScore > 0 ? "BUY" : "SELL") : null },
                cmf: { rawValue: sw.cmf ?? null, signal: sw.cmf != null ? (sw.cmf > 0.05 ? "BUY" : sw.cmf < -0.05 ? "SELL" : "NEUTRAL") : null },
                mfi: { rawValue: sw.mfi ?? null, signal: sw.mfi != null ? (sw.mfi > 80 ? "SELL" : sw.mfi < 20 ? "BUY" : "NEUTRAL") : null },
                volume_zscore: { rawValue: sw.volumeZScore ?? null, signal: sw.volumeZScore != null ? (sw.volumeZScore > 2 ? "BUY" : sw.volumeZScore < -2 ? "SELL" : "NEUTRAL") : null },
                order_flow_est: { rawValue: sw.estNetVolume ?? null, signal: sw.estNetVolume != null ? (sw.estNetVolume > 0 ? "BUY" : sw.estNetVolume < 0 ? "SELL" : "NEUTRAL") : null },
              };
            }
          } catch { /* skip fallback */ }
        }

        return {
          symbol: sym,
          series,
          signals,
          latestClose: series.length > 0 ? series[series.length - 1].close : null,
        };
      })
    );

    return NextResponse.json({
      range: rangeParam,
      rangeDays,
      symbols: result,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
