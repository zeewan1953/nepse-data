import "server-only";
import { db, execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// §8 Retention policy — purge raw daily rows older than RETENTION_MONTHS.
// Default 24 months; one-line env change to adjust (e.g. 12 for 1-year retention).
// Deletion runs as a single libsql transaction (batch "write") — all-or-nothing.

function cutoffDate(months: number): string {
  // Compute cutoff in Asia/Kathmandu calendar terms, then format YYYY-MM-DD.
  const nowNpt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  nowNpt.setMonth(nowNpt.getMonth() - months);
  return nowNpt.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Tables holding raw daily rows keyed by a trade-date column.
const RAW_TABLES: Array<{ table: string; dateCol: string }> = [
  { table: "merolagani_broker_daily", dateCol: "tradeDate" },
  { table: "floorsheet_trades", dateCol: "tradeDate" },
  { table: "broker_daily_agg", dateCol: "tradeDate" },
  { table: "broker_daily_summary", dateCol: "tradeDate" },
  { table: "stock_daily_ohlcv", dateCol: "tradeDate" },
];

export async function GET() {
  const months = Number(process.env.RETENTION_MONTHS) || 24;
  const cutoff = cutoffDate(months);
  const startTs = Date.now();

  try {
    // Count what will be deleted (for the report) before purging.
    const counts: Record<string, number> = {};
    for (const { table, dateCol } of RAW_TABLES) {
      try {
        const r = await execute(`SELECT COUNT(*) AS c FROM ${table} WHERE ${dateCol} < ?`, [cutoff]);
        counts[table] = Number((r.rows[0] as any)?.c ?? 0);
      } catch {
        counts[table] = 0; // table may not exist yet
      }
    }

    const totalToDelete = Object.values(counts).reduce((a, b) => a + b, 0);

    if (totalToDelete === 0) {
      return Response.json({
        success: true,
        cutoff,
        retentionMonths: months,
        deleted: 0,
        counts,
        message: "Nothing older than cutoff",
        duration: Date.now() - startTs,
      });
    }

    // Transactional delete — all tables in one write batch, rolls back on failure.
    const statements = RAW_TABLES
      .filter(({ table }) => counts[table] > 0)
      .map(({ table, dateCol }) => ({
        sql: `DELETE FROM ${table} WHERE ${dateCol} < ?`,
        args: [cutoff],
      }));

    await db.batch(statements, "write");

    return Response.json({
      success: true,
      cutoff,
      retentionMonths: months,
      deleted: totalToDelete,
      counts,
      duration: Date.now() - startTs,
    });
  } catch (e) {
    console.error("[retention] purge failed (rolled back):", (e as Error).message);
    return Response.json(
      { success: false, cutoff, retentionMonths: months, error: (e as Error)?.message ?? "Retention failed" },
      { status: 500 },
    );
  }
}
