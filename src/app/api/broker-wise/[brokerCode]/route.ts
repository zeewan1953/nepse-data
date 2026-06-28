import "server-only";
import { execute } from "@/lib/db";
import { computeNetFlowStreak } from "@/lib/broker_flow_analytics";
import { getTradingDaysForRange, TRADING_DAYS } from "@/lib/trading-periods";
import { todayStr } from "@/lib/date-utils";

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

    const nTradingDays = TRADING_DAYS[range];
    if (!nTradingDays) {
      return Response.json({ brokerCode, error: `Invalid range: ${range}` }, { status: 400 });
    }

    // Get all stored dates
    const dateRows = await execute(
      "SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate DESC"
    );
    const storedDates = dateRows.rows.map((r: any) => String(r.tradeDate));

    if (!storedDates.length) {
      return Response.json({ brokerCode, error: "No dates available" }, { status: 404 });
    }

    // For 1D: use the latest stored date (DB-only, no live fallback — the cron fetches it)
    // For multi-day: compute trading-day range from today backwards, filter against stored dates
    const latestStored = storedDates[0];

    let targetDates: string[];
    if (nTradingDays <= 1) {
      targetDates = [latestStored];
    } else {
      const idealDays = getTradingDaysForRange(range);
      // Only return dates that actually exist in the DB
      const storedSet = new Set(storedDates);
      targetDates = idealDays.filter((d) => storedSet.has(d));
    }

    if (!targetDates.length) {
      return Response.json({ brokerCode, error: "No stored data for this range" }, { status: 404 });
    }

    const fromDate = targetDates[0];
    const toDate = targetDates[targetDates.length - 1];

    const rows = await execute(
      `SELECT tradeDate, purchaseAmt, sellAmt, netAmt, totalAmt, brokerName
       FROM merolagani_broker_daily 
       WHERE brokerCode = ? AND tradeDate >= ? AND tradeDate <= ?
       ORDER BY tradeDate ASC`,
      [brokerCode, fromDate, toDate],
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
      tradingDaysRequested: nTradingDays,
      tradingDaysReturned: daysAvailable,
      resolution: "stored",
      history,
      totals,
      currentStreak,
      rollingNetFlow,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed" }, { status: 502 });
  }
}
