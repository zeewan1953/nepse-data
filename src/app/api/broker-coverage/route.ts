import "server-only";
import { execute } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single source of truth for how much real data is stored in the DB.
// Covers BOTH broker-wise (merolagani_broker_daily) and stock-wise (floorsheet_trades),
// so the UI can show progress toward a full month / year of history.
async function coverageFor(
  table: string,
  dateCol: string,
): Promise<{ days: number; firstDate: string | null; lastDate: string | null; rows: number }> {
  try {
    const r = await execute(
      `SELECT COUNT(DISTINCT ${dateCol}) AS days,
              MIN(${dateCol}) AS firstDate,
              MAX(${dateCol}) AS lastDate,
              COUNT(*) AS rows
       FROM ${table}`,
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    return {
      days: Number(row?.days ?? 0),
      firstDate: row?.firstDate ? String(row.firstDate) : null,
      lastDate: row?.lastDate ? String(row.lastDate) : null,
      rows: Number(row?.rows ?? 0),
    };
  } catch {
    return { days: 0, firstDate: null, lastDate: null, rows: 0 };
  }
}

export async function GET() {
  try {
    const [broker, floorsheet, brokerMeta] = await Promise.all([
      coverageFor("merolagani_broker_daily", "tradeDate"),
      coverageFor("floorsheet_trades", "tradeDate"),
      execute("SELECT COUNT(DISTINCT brokerCode) AS brokers FROM merolagani_broker_daily").catch(() => null),
    ]);

    const brokers = brokerMeta ? Number((brokerMeta.rows[0] as any)?.brokers ?? 0) : 0;

    return Response.json({
      // legacy top-level fields (broker-wise) kept for existing UI
      days: broker.days,
      firstDate: broker.firstDate,
      lastDate: broker.lastDate,
      brokers,
      rows: broker.rows,
      targetDays: 365,
      source: "verified",
      // detailed per-dataset coverage
      brokerWise: { ...broker, brokers },
      stockWise: floorsheet,
      monthPct: Math.min(100, Math.round((broker.days / 21) * 100)), // ~21 trading days = 1 month
      yearPct: Math.min(100, Math.round((broker.days / 365) * 100)),
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed" }, { status: 502 });
  }
}
