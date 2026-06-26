import "server-only";
import { execute } from "@/lib/db";
import { getTradingDays, todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// §9 Data-completeness health check.
// Reports gaps in broker-wise + stock-wise data over the retention window.
// Dates older than the retention cutoff are EXPECTED to be absent (purged) and
// are not counted as gaps — only missing trading days INSIDE the window are.

function cutoffDate(months: number): string {
  const nowNpt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  nowNpt.setMonth(nowNpt.getMonth() - months);
  return nowNpt.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

async function storedDates(table: string, dateCol: string): Promise<Set<string>> {
  try {
    const r = await execute(`SELECT DISTINCT ${dateCol} AS d FROM ${table}`);
    return new Set(r.rows.map((row: any) => String(row.d)));
  } catch {
    return new Set();
  }
}

export async function GET() {
  try {
    const retentionMonths = Number(process.env.RETENTION_MONTHS) || 24;
    const cutoff = cutoffDate(retentionMonths);
    const today = todayStr();

    // Expected trading days within the retention window [cutoff, today].
    // Exclude today itself if before market-close the row legitimately doesn't exist yet.
    const expected = getTradingDays(cutoff, today).filter((d) => d < today);

    const [brokerDates, stockDates] = await Promise.all([
      storedDates("merolagani_broker_daily", "tradeDate"),
      storedDates("floorsheet_trades", "tradeDate"),
    ]);

    const brokerGaps = expected.filter((d) => !brokerDates.has(d));
    const stockGaps = expected.filter((d) => !stockDates.has(d));

    const healthy = brokerGaps.length === 0 && stockGaps.length === 0;

    return Response.json({
      healthy,
      retentionMonths,
      cutoff,
      window: { from: cutoff, to: today },
      expectedTradingDays: expected.length,
      brokerWise: {
        storedDays: brokerDates.size,
        gaps: brokerGaps,
        gapCount: brokerGaps.length,
      },
      stockWise: {
        storedDays: stockDates.size,
        gaps: stockGaps,
        gapCount: stockGaps.length,
      },
      note: "Dates older than cutoff are purged by retention and not counted as gaps.",
    });
  } catch (e) {
    return Response.json({ healthy: false, error: (e as Error)?.message ?? "Health check failed" }, { status: 500 });
  }
}
