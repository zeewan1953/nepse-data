import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import {
  saveIntradayCandles,
  upsertBrokerDailySummary,
  getBrokerDailyHash,
  computeHash,
  execute,
  getFloorsheetCount,
} from "@/lib/db";
import { isTradingDay, todayStr, getTradingDays } from "@/lib/date-utils";
import type { IntradayCandle } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto Data Collector Endpoint — three-attempt redundant broker ingest.
 *
 * GET /api/cron/collect?attempt=1
 *
 * All three attempts target "whatever MeroLagani currently calls previous day."
 *  - Attempt 1: right after market close
 *  - Attempt 2: retry, covers transient failures
 *  - Attempt 3: last-chance safety net next morning
 *
 * Each run:
 *  1. Fetch MeroLagani
 *  2. Compute hash of broker data
 *  3. Compare with stored hash for that date
 *  4. Same hash → skip | Different hash → update | No stored → insert
 *  5. Log explicitly
 */

export async function GET(req: NextRequest) {
  const attempt = Number(req.nextUrl.searchParams.get("attempt")) || 1;
  const startTs = Date.now();

  try {
    const nowNpt = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });
    const nptHour = new Date(nowNpt).getHours();
    const today = todayStr();
    const isAfterMarket = nptHour >= 15;

    const mero = await fetchMeroLaganiSummary();

    // Stock data ingest (every minute during market hours)
    if (mero?.stock?.detail?.length) {
      const now = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(now / 60) * 60;
      let collected = 0;

      for (const stock of mero.stock.detail) {
        if (stock.lp <= 0 || stock.q <= 0) continue;
        const candle: IntradayCandle = {
          ts: bucket, open: stock.lp, high: stock.lp, low: stock.lp, close: stock.lp, volume: stock.q,
        };
        try { await saveIntradayCandles(stock.s, [candle]); collected++; } catch { /* continue */ }
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
          ts: bucket, open: indexValue, high: indexValue, low: indexValue, close: indexValue,
          volume: active.reduce((a: number, s: any) => a + s.q, 0),
        };
        try { await saveIntradayCandles("NEPSE", [indexCandle]); collected++; } catch { /* continue */ }
      }
    }

    // ── Broker data ingest (attempt-based, always fetches + hash-checks) ──
    let brokerResult = { action: "skipped" as string, count: 0, date: "" as string | null };
    if (mero?.broker?.detail?.length) {
      brokerResult = await ingestBrokerData(mero, today, attempt);
    } else if (isAfterMarket && isTradingDay(today)) {
      console.error(`[collect] Attempt ${attempt}: MeroLagani returned no broker data`);
      brokerResult = { action: "error", count: 0, date: null };
    }

    // ── Floorsheet sync (stock-wise broker kitta) — store daily, same as broker-wise ──
    // Attempt on every trading-day run; the sync route is idempotent (re-saves only
    // when the trade count changes), so running it more than once a day is safe and
    // makes collection robust against transient NEPSE failures.
    let floorsheetResult: { action: string; trades: number; date: string } = { action: "skipped", trades: 0, date: today };
    if (isTradingDay(today)) {
      floorsheetResult = await syncFloorsheet(req, today);
    }

    // ── Gap check on attempt 3 ──
    let gapReport = null;
    if (attempt === 3) {
      gapReport = await checkBrokerDataGaps();
    }

    return Response.json({
      success: true,
      attempt,
      message: brokerResult.date
        ? `Broker ${brokerResult.action}: ${brokerResult.count} rows for ${brokerResult.date}`
        : "No broker data processed",
      nptHour,
      duration: Date.now() - startTs,
      brokerResult,
      floorsheetResult,
      gapReport,
      ts: Date.now(),
    });
  } catch (e) {
    console.error(`[collect] Attempt ${attempt}: Fatal error:`, (e as Error).message);
    return Response.json({
      success: false,
      attempt,
      message: (e as Error).message ?? "Collection failed",
      ts: Date.now(),
    }, { status: 500 });
  }
}

/**
 * Always fetch MeroLagani, compute hash, compare with stored.
 * Returns { action: "insert" | "update" | "skip" | "error", count, date }.
 */
async function ingestBrokerData(
  mero: any,
  today: string,
  attempt: number,
): Promise<{ action: string; count: number; date: string | null }> {
  const brokerDate = mero.broker?.date;
  if (!brokerDate) {
    console.error(`[collect] Attempt ${attempt}: No broker.date in MeroLagani response`);
    return { action: "error", count: 0, date: null };
  }

  // Normalize the date from MeroLagani (may be "2026/06/25 03:00:00" format)
  const normalizedDate = brokerDate.includes("/")
    ? brokerDate.split(" ")[0].replace(/\//g, "-")
    : brokerDate;

  // ── Validation gate (§7): reject rows missing required fields; log + continue.
  // Required: brokerCode + at least one of purchase/sell present and numeric.
  // A genuine numeric 0 is allowed; a missing/non-numeric field rejects the row.
  const rejected: Array<{ reason: string; raw: string }> = [];
  const brokers = mero.broker.detail
    .map((b: any) => {
      const brokerCode = b?.b != null ? String(b.b).trim() : "";
      const p = Number(b?.p);
      const s = Number(b?.s);
      const t = Number(b?.t);
      if (!brokerCode) {
        rejected.push({ reason: "missing brokerCode", raw: JSON.stringify(b).slice(0, 160) });
        return null;
      }
      if (!Number.isFinite(p) || !Number.isFinite(s)) {
        rejected.push({ reason: "non-numeric purchase/sell", raw: JSON.stringify(b).slice(0, 160) });
        return null;
      }
      return {
        brokerCode,
        brokerName: b?.n ? String(b.n) : "",
        purchaseAmt: p,
        sellAmt: s,
        netAmt: p - s,
        totalAmt: Number.isFinite(t) ? t : p + s,
      };
    })
    .filter(Boolean) as Array<{
      brokerCode: string; brokerName: string; purchaseAmt: number; sellAmt: number; netAmt: number; totalAmt: number;
    }>;

  if (rejected.length) {
    console.error(`[collect] Attempt ${attempt}: rejected ${rejected.length} broker row(s):`, rejected.slice(0, 5));
  }
  if (!brokers.length) {
    console.error(`[collect] Attempt ${attempt}: all broker rows rejected for ${normalizedDate}, nothing to store`);
    return { action: "error", count: 0, date: normalizedDate };
  }

  // Compute hash of this batch
  const newHash = computeHash(brokers);
  console.log(`[collect] Attempt ${attempt}: Broker date=${normalizedDate}, hash=${newHash}, brokers=${brokers.length}`);

  // Check stored hash
  const existingHash = await getBrokerDailyHash(normalizedDate);

  if (existingHash === newHash) {
    console.log(`[collect] Attempt ${attempt}: Hash match for ${normalizedDate}, skipping`);
    return { action: "skip", count: 0, date: normalizedDate };
  }

  if (existingHash) {
    console.log(`[collect] Attempt ${attempt}: Hash mismatch for ${normalizedDate} (${existingHash} → ${newHash}), updating`);
  } else {
    console.log(`[collect] Attempt ${attempt}: New date ${normalizedDate}, inserting`);
  }

  const count = await upsertBrokerDailySummary(normalizedDate, brokers);
  const action = existingHash ? "update" : "insert";
  return { action, count, date: normalizedDate };
}

/**
 * Trigger floorsheet sync (stock-wise broker kitta) for the given date.
 * Calls the existing /api/floorsheet/sync route internally using the request origin.
 * Skips if the day's trades are already stored.
 */
async function syncFloorsheet(
  req: NextRequest,
  date: string,
): Promise<{ action: string; trades: number; date: string }> {
  try {
    const existing = await getFloorsheetCount(date);
    if (existing > 0) {
      // sync route re-checks and only re-saves if the trade count changed,
      // so we still call it but report cheaply when nothing new is expected.
    }
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/floorsheet/sync?date=${date}`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[collect] Floorsheet sync HTTP ${res.status} for ${date}`);
      return { action: "error", trades: existing, date };
    }
    const data = await res.json();
    const trades = Number(data?.tradeCount ?? 0);
    const after = await getFloorsheetCount(date);
    const action = existing === 0 ? "insert" : after !== existing ? "update" : "unchanged";
    console.log(`[collect] Floorsheet ${action}: ${trades} trades for ${date}`);
    return { action, trades, date };
  } catch (e) {
    console.error(`[collect] Floorsheet sync failed for ${date}:`, (e as Error).message);
    return { action: "error", trades: 0, date };
  }
}

/**
 * Check for missing broker data days in trailing 30 trading days.
 * Logs gaps classified as pending-recovery, permanently-missing, or ambiguous.
 */
async function checkBrokerDataGaps(): Promise<{
  checkedDays: number;
  present: number;
  pendingRecovery: string[];
  permanentlyMissing: string[];
  ambiguous: string[];
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  const trailingDays = getTradingDays(thirtyDaysAgo, todayStr());

  const result = await execute("SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate DESC");
  const storedDates = new Set(result.rows.map((r: any) => String(r.tradeDate)));

  const gaps: string[] = [];
  for (const d of trailingDays) {
    if (!storedDates.has(d)) gaps.push(d);
  }

  const pendingRecovery: string[] = [];
  const permanentlyMissing: string[] = [];
  const ambiguous: string[] = [];

  for (const gap of gaps) {
    // Check if it's a known holiday (ambiguous - can't distinguish holiday from real gap)
    const isHoliday = !isTradingDay(gap);
    if (isHoliday) {
      ambiguous.push(gap);
      continue;
    }

    // Within last 1 trading day → still pending recovery
    const lastTradeDays = getTradingDays(
      new Date(Date.now() - 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }),
      todayStr(),
    );
    if (lastTradeDays.includes(gap)) {
      pendingRecovery.push(gap);
    } else {
      permanentlyMissing.push(gap);
    }
  }

  if (permanentlyMissing.length > 0) {
    console.error(`[collect] GAP: Permanently missing broker data days: ${permanentlyMissing.join(", ")}`);
  }
  if (ambiguous.length > 0) {
    console.log(`[collect] GAP: Ambiguous (possible holidays): ${ambiguous.join(", ")}`);
  }

  return {
    checkedDays: trailingDays.length,
    present: storedDates.size,
    pendingRecovery,
    permanentlyMissing,
    ambiguous,
  };
}
