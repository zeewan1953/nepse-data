import "server-only";
import { execute } from "@/lib/db";
import { computeNetFlowStreak } from "@/lib/broker_flow_analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ brokerCode: string }> }
) {
  try {
    const { brokerCode } = await params;
    const sp = new URL(req.url).searchParams;
    const range = sp.get("range") || "1D";

    const lookback: Record<string, number> = { "1D": 0, "3D": 2, "1W": 6, "1M": 21, "3M": 63 };

    // Get dates from merolagani_broker_daily (not floorsheet_trades)
    const dateRows = await execute(
      "SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate DESC"
    );
    const sortedDates = dateRows.rows.map((r: any) => String(r.tradeDate));

    if (!sortedDates.length) {
      return Response.json({ brokerCode, error: "No dates available" }, { status: 404 });
    }

    const latestDate = sortedDates[0];
    const lookbackDays = lookback[range] ?? 0;
    const fromIdx = Math.min(lookbackDays, sortedDates.length - 1);
    const fromDate = sortedDates[fromIdx];

    const rows = await execute(
      `SELECT tradeDate, purchaseAmt, sellAmt, netAmt, totalAmt, brokerName
       FROM merolagani_broker_daily 
       WHERE brokerCode = ? AND tradeDate >= ? AND tradeDate <= ?
       ORDER BY tradeDate ASC`,
      [brokerCode, fromDate, latestDate],
    );

    if (!rows.rows.length) {
      return Response.json({ brokerCode, error: "No data for this broker" }, { status: 404 });
    }

    const history = rows.rows.map((r: any) => ({
      tradeDate: String(r.tradeDate),
      purchaseAmt: Number(r.purchaseAmt),
      sellAmt: Number(r.sellAmt),
      netAmt: Number(r.netAmt),
      totalAmt: Number(r.totalAmt),
    }));

    const brokerName = String(rows.rows[0].brokerName || "");
    const daysAvailable = history.length;
    const currentStreak = computeNetFlowStreak(history);
    const rollingNetFlow = history.reduce((a: number, r: any) => a + r.netAmt, 0);

    const totals = history.reduce(
      (a: { buyAmount: number; sellAmount: number; netAmount: number; turnover: number }, r: any) => {
        a.buyAmount += Number(r.purchaseAmt);
        a.sellAmount += Number(r.sellAmt);
        a.netAmount += Number(r.netAmt);
        a.turnover += Number(r.totalAmt);
        return a;
      },
      { buyAmount: 0, sellAmount: 0, netAmount: 0, turnover: 0 },
    );

    return Response.json({
      brokerCode,
      brokerName,
      daysAvailable,
      history,
      totals,
      currentStreak,
      rollingNetFlow,
      source: "merolagani",
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed" }, { status: 502 });
  }
}
