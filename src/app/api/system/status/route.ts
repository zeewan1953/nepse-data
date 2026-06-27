import "server-only";
import { db, getSyncLogs, getErrorLogs, getAvailableDates, getLatestMeroBrokerDate, hasMeroBrokerData } from "@/lib/db";
import { execute } from "@/lib/db";
import { todayStr, getTradingDays } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Count rows in a table safely
async function countTable(table: string): Promise<number> {
  try {
    const r = await execute(`SELECT COUNT(*) as c FROM ${table}`);
    return Number((r.rows[0] as any)?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const today = todayStr();
    const [brokerRows, aggRows, fsRows, syncLogs, errorLogs, latestMeroDate, hasToday, latestFsDate] = await Promise.all([
      countTable("merolagani_broker_daily"),
      countTable("broker_daily_agg"),
      countTable("floorsheet_trades"),
      getSyncLogs(5),
      getErrorLogs(5),
      getLatestMeroBrokerDate(),
      hasMeroBrokerData(today),
      (async () => {
        try {
          const r = await execute("SELECT MAX(tradeDate) AS d FROM floorsheet_trades");
          return r.rows[0]?.d ? String(r.rows[0].d) : null;
        } catch { return null; }
      })(),
    ]);

    const storedDates = await getAvailableDates();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    const tradingDaysInWindow = getTradingDays(thirtyDaysAgo, today);
    const datesInWindow = new Set(tradingDaysInWindow);
    const storedInWindow = storedDates.filter((d) => datesInWindow.has(d)).length;

    // DB file size (local SQLite only)
    let dbSizeBytes = 0;
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dbUrl = process.env.VERCEL === "1"
        ? "/tmp/darisir.db"
        : path.join(process.cwd(), "data", "darisir.db");
      const stat = fs.statSync(dbUrl);
      dbSizeBytes = stat.size;
    } catch {}

    const lastSync = syncLogs[0] || null;
    const lastError = errorLogs[0] || null;

    return Response.json({
      timestamp: new Date().toISOString(),
      lastSyncTime: lastSync ? new Date(lastSync.ts).toISOString() : null,
      lastSyncStatus: lastSync?.status ?? null,
      lastSyncDetail: lastSync?.detail ?? null,
      lastError: lastError ? {
        time: new Date(lastError.ts).toISOString(),
        source: lastError.source,
        message: lastError.message,
      } : null,
      database: {
        brokerDailyRows: brokerRows,
        brokerAggRows: aggRows,
        floorsheetRows: fsRows,
        latestFloorsheetDate: latestFsDate,
        totalTradingDays: storedDates.length,
        daysIn30DayWindow: storedInWindow,
        expected30DayWindow: tradingDaysInWindow.length,
        latestDataDate: latestDate,
        hasTodayData: hasToday,
        sizeBytes: dbSizeBytes,
      },
      scheduler: {
        cronSchedule: "18 9 * * 0-4 UTC (15:03 NPT)",
        attempt1: "Immediately after market close",
        attempt2: "~2 hours later (retry)",
        attempt3: "Next morning (final retry)",
      },
      source: "MeroLagani /handlers/webrequesthandler.ashx?type=market_summary",
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Status check failed" }, { status: 500 });
  }
}
