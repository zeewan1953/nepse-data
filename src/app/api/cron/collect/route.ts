import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { saveIntradayCandles, type IntradayCandle } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto Data Collector Endpoint
 * 
 * Call this every minute from an external cron (Vercel Cron, GitHub Actions, etc.)
 * to collect and store NEPSE market data.
 * 
 * GET /api/cron/collect
 * 
 * Flow:
 * 1. Fetch latest prices from MeroLagani
 * 2. Build 1-minute OHLCV candles for all stocks
 * 3. Save to intraday_candles table
 * 4. Return collection stats
 */
export async function GET() {
  try {
    const mero = await fetchMeroLaganiSummary();
    if (!mero?.stock?.detail?.length) {
      return Response.json({ 
        success: false, 
        message: "No data from MeroLagani",
        ts: Date.now(),
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / 60) * 60; // 1-min bucket
    let collected = 0;

    // Build candles for all stocks
    for (const stock of mero.stock.detail) {
      if (stock.lp <= 0 || stock.q <= 0) continue;

      const candle: IntradayCandle = {
        ts: bucket,
        open: stock.lp,  // For 1-min candle, O=H=L=C=last_price
        high: stock.lp,
        low: stock.lp,
        close: stock.lp,
        volume: stock.q,
      };

      try {
        await saveIntradayCandles(stock.s, [candle]);
        collected++;
      } catch { /* continue on error */ }
    }

    // Also compute and save NEPSE Index candle
    const active = mero.stock.detail.filter(s => s.lp > 0 && s.q > 0);
    if (active.length > 0) {
      const BASE_INDEX = 2700;
      let totalPctChange = 0;
      let weight = 0;
      for (const s of active) {
        const prevClose = s.lp - s.c;
        if (prevClose > 0) {
          const pctChg = ((s.lp - prevClose) / prevClose) * 100;
          const w = Math.sqrt(s.q);
          totalPctChange += pctChg * w;
          weight += w;
        }
      }
      const avgPct = weight > 0 ? totalPctChange / weight : 0;
      const indexValue = Math.round((BASE_INDEX * (1 + avgPct / 100)) * 100) / 100;
      const totalVol = active.reduce((sum, s) => sum + s.q, 0);

      const indexCandle: IntradayCandle = {
        ts: bucket,
        open: indexValue,
        high: indexValue,
        low: indexValue,
        close: indexValue,
        volume: totalVol,
      };

      try {
        await saveIntradayCandles("NEPSE", [indexCandle]);
        collected++;
      } catch { /* continue */ }
    }

    return Response.json({
      success: true,
      message: `Collected ${collected} symbols`,
      bucket,
      ts: Date.now(),
      stocks: mero.stock.detail.length,
      collected,
    });
  } catch (e) {
    return Response.json({
      success: false,
      message: (e as Error).message ?? "Collection failed",
      ts: Date.now(),
    }, { status: 500 });
  }
}
