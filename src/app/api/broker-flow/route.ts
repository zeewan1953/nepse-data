import { getFloorBrokerData, getBrokerDailySummary } from "@/lib/db";
import { getLastNTradingDays, todayStr, isTradingDay } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 5,
  "1m": 22,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brokerCode = searchParams.get("broker_code");
  const period = searchParams.get("period") || "1d";
  const endDate = searchParams.get("end_date") || todayStr();

  if (!brokerCode) {
    return Response.json({ error: "broker_code param required" }, { status: 400 });
  }

  const n = PERIOD_DAYS[period];
  if (!n) {
    return Response.json({ error: `invalid period '${period}'; use 1d, 3d, 1w, or 1m` }, { status: 400 });
  }

  if (!isTradingDay(endDate)) {
    return Response.json({ error: `end_date ${endDate} is not a trading day` }, { status: 400 });
  }

  try {
    const days = getLastNTradingDays(n, endDate);
    const daily: Array<Record<string, unknown>> = [];

    for (const day of days) {
      // Try floorsheet first (authoritative)
      let row = await getFloorBrokerData(day, brokerCode);

      // Fallback to MeroLagani cache
      if (!row) {
        const summary = await getBrokerDailySummary(day);
        const found = summary.find((r) => r.brokerCode === brokerCode);
        if (found) {
          daily.push({
            date: day,
            buy_qty: found.buyQty,
            sell_qty: found.sellQty,
            net_qty: found.buyQty != null && found.sellQty != null ? (found.buyQty as number) - (found.sellQty as number) : null,
            buy_amt: found.buyAmt,
            sell_amt: found.sellAmt,
            net_amt: found.netAmt,
            source: "merolagani",
          });
          continue;
        }
      }

      if (row) {
        daily.push({
          date: day,
          buy_qty: row.buyQty,
          sell_qty: row.sellQty,
          net_qty: row.netQty,
          buy_amt: row.buyAmt,
          sell_amt: row.sellAmt,
          net_amt: row.netAmt,
          source: row.source,
        });
      } else {
        daily.push({
          date: day,
          buy_qty: null,
          sell_qty: null,
          net_qty: null,
          buy_amt: null,
          sell_amt: null,
          net_amt: null,
          source: null,
        });
      }
    }

    const valid = daily.filter((r) => r.net_amt != null);
    const netQtyTotal = valid.length > 0 ? valid.reduce((a, r) => a + (r.net_qty as number), 0) : null;
    const netAmtTotal = valid.length > 0 ? valid.reduce((a, r) => a + (r.net_amt as number), 0) : null;

    return Response.json({
      broker_code: brokerCode,
      period,
      from: days[0],
      to: days[days.length - 1],
      net_qty_total: netQtyTotal,
      net_amt_total: netAmtTotal,
      daily,
      source: "merolagani",
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}