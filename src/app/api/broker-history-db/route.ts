import "server-only";
import { db, getFloorBrokerData, getMeroBrokerData } from "@/lib/db";
import { getTradingDays, todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Broker history — reads ONLY from database.
// Returns data for a broker over a date range, preferring floorsheet (per-stock)
// data when available, falling back to MeroLagani daily totals.

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brokerCode = url.searchParams.get("broker_code");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!brokerCode || !from || !to) {
      return Response.json({ error: "broker_code, from, to are required" }, { status: 400 });
    }

    const tradingDays = getTradingDays(from, to);
    const results: Array<Record<string, unknown>> = [];

    for (const day of tradingDays) {
      let row = await getFloorBrokerData(day, brokerCode);
      if (!row) {
        row = await getMeroBrokerData(day, brokerCode);
      }
      if (row) {
        results.push({
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
        results.push({
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

    return Response.json({
      brokerCode,
      from,
      to,
      tradingDays: tradingDays.length,
      results,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
