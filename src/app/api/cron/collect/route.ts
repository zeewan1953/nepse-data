import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { saveIntradayCandles, upsertBrokerDailySummary, getBrokerDailyHash } from "@/lib/db";
import { isTradingDay, todayStr } from "@/lib/date-utils";
import type { IntradayCandle } from "@/lib/db";

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
 * 1. Fetch latest prices from MeroLagani (intraday every minute)
 * 2. Build 1-minute OHLCV candles for all stocks
 * 3. Save to intraday_candles table
 * 4. After market close (15:30+ NPT), also save EOD broker summary
 */

export async function GET() {
  try {
    const nowNpt = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });
    const nptHour = new Date(nowNpt).getHours();
    const today = todayStr();
    const isAfterMarket = nptHour >= 15; // 15:00 NPT or later

    const mero = await fetchMeroLaganiSummary();
    if (!mero?.stock?.detail?.length) {
      // Still try broker ingest even if intraday data is unavailable
      if (isAfterMarket && isTradingDay(today)) {
        await maybeIngestBroker(today, mero);
      }
      return Response.json({
        success: false,
        message: "No stock data from MeroLagani",
        ts: Date.now(),
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / 60) * 60;
    let collected = 0;

    // Build candles for all stocks
    for (const stock of mero.stock.detail) {
      if (stock.lp <= 0 || stock.q <= 0) continue;
      const candle: IntradayCandle = {
        ts: bucket,
        open: stock.lp,
        high: stock.lp,
        low: stock.lp,
        close: stock.lp,
        volume: stock.q,
      };
      try {
        await saveIntradayCandles(stock.s, [candle]);
        collected++;
      } catch { /* continue */ }
    }

    // NEPSE Index candle
    const active = mero.stock.detail.filter((s: any) => s.lp > 0 && s.q > 0);
    if (active.length > 0) {
      const BASE_INDEX = 2700;
      let totalPctChange = 0, weight = 0;
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
      const indexCandle: IntradayCandle = {
        ts: bucket, open: indexValue, high: indexValue, low: indexValue, close: indexValue, volume: active.reduce((a: number, s: any) => a + s.q, 0),
      };
      try { await saveIntradayCandles("NEPSE", [indexCandle]); collected++; } catch { /* continue */ }
    }

    // EOD broker ingest (once per day, after market close)
    let brokerSaved = 0;
    if (isAfterMarket && isTradingDay(today)) {
      brokerSaved = await maybeIngestBroker(today, mero);
    }

    return Response.json({
      success: true,
      message: `Collected ${collected} symbols${brokerSaved > 0 ? `, brokers: ${brokerSaved}` : ""}`,
      bucket,
      ts: Date.now(),
      stocks: mero.stock.detail.length,
      collected,
      brokerSaved,
    });
  } catch (e) {
    return Response.json({
      success: false,
      message: (e as Error).message ?? "Collection failed",
      ts: Date.now(),
    }, { status: 500 });
  }
}

async function maybeIngestBroker(date: string, mero: any): Promise<number> {
  const existingHash = await getBrokerDailyHash(date);
  if (existingHash) return 0; // already cached, no change

  // If mero wasn't passed in (null from earlier check), re-fetch
  let data = mero;
  if (!data?.broker?.detail?.length) {
    data = await fetchMeroLaganiSummary();
  }
  if (!data?.broker?.detail?.length) return 0;

  const brokers = data.broker.detail.map((b: any) => ({
    brokerCode: b.b,
    brokerName: b.n || "",
    purchaseAmt: Number(b.p) || 0,
    sellAmt: Number(b.s) || 0,
    netAmt: Number(b.m) || 0,
    totalAmt: Number(b.t) || 0,
  }));

  return upsertBrokerDailySummary(date, brokers);
}