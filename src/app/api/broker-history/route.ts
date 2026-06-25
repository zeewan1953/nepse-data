import { getFloorBrokerData, getMeroBrokerData, saveMeroLaganiBrokerDaily } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { getTradingDays, todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brokerCode = searchParams.get("broker_code");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!brokerCode || !fromParam || !toParam) {
    return Response.json({ error: "broker_code, from, to params required" }, { status: 400 });
  }

  try {
    const tradingDays = getTradingDays(fromParam, toParam);
    const results: Array<Record<string, unknown>> = [];
    let liveFetched = false;

    for (const day of tradingDays) {
      const isToday = day === todayStr();

      let row = await getFloorBrokerData(day, brokerCode);

      if (!row) {
        row = await getMeroBrokerData(day, brokerCode);
      }

      if (!row && isToday) {
        if (!liveFetched) {
          await sleep(800 + Math.random() * 1200);
          const mero = await fetchMeroLaganiSummary();
          if (mero?.broker?.detail?.length) {
            const meroDate = mero.broker.date || mero.overall?.d || day;
            const normDate = meroDate.slice(0, 10).replace(/\//g, "-");
            const brokers = mero.broker.detail.map((b: any) => ({
              tradeDate: normDate,
              brokerCode: b.b,
              brokerName: b.n || "",
              purchaseAmt: Number(b.p) || 0,
              sellAmt: Number(b.s) || 0,
              netAmt: Number(b.m) || 0,
              totalAmt: Number(b.t) || 0,
            }));
            await saveMeroLaganiBrokerDaily(normDate, brokers);
            liveFetched = true;
          }
        }
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
      broker_code: brokerCode,
      from: fromParam,
      to: toParam,
      trading_days: tradingDays.length,
      results,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}