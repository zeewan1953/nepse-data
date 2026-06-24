import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string; symbol: string }> }) {
  const { code, symbol } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!code || !symbol) {
    return Response.json({ error: "broker code and symbol are required" }, { status: 400 });
  }

  const sym = symbol.toUpperCase();
  const brokerCode = code;

  // Get earliest and latest dates available
  const dateRange = await db.execute({
    sql: `SELECT MIN(tradeDate) as minDate, MAX(tradeDate) as maxDate
          FROM broker_daily_agg WHERE brokerId = ? AND stockSymbol = ?`,
    args: [brokerCode, sym],
  });

  const minDate = String(dateRange.rows[0]?.minDate ?? from ?? "1970-01-01");
  const maxDate = String(dateRange.rows[0]?.maxDate ?? to ?? new Date().toISOString().slice(0, 10));
  const effectiveFrom = from ?? minDate;
  const effectiveTo = to ?? maxDate;

  // Get daily net positions over the range
  const dailyResult = await db.execute({
    sql: `SELECT tradeDate,
                 buyQty, sellQty, netQty, buyAmt, sellAmt, netAmt,
                 COALESCE(status, 'finalized') as status
          FROM broker_daily_agg
          WHERE brokerId = ? AND stockSymbol = ? AND tradeDate >= ? AND tradeDate <= ?
          ORDER BY tradeDate ASC`,
    args: [brokerCode, sym, effectiveFrom, effectiveTo],
  });

  // Cumulative net position
  const cumResult = await db.execute({
    sql: `SELECT SUM(netQty) as cumulativeQty, SUM(netAmt) as cumulativeAmt
          FROM broker_daily_agg
          WHERE brokerId = ? AND stockSymbol = ? AND tradeDate >= ? AND tradeDate <= ?`,
    args: [brokerCode, sym, effectiveFrom, effectiveTo],
  });

  const cumulativeQty = Number(cumResult.rows[0]?.cumulativeQty ?? 0);
  const cumulativeAmt = Number(cumResult.rows[0]?.cumulativeAmt ?? 0);

  const days = dailyResult.rows.map((r) => ({
    date: String(r.tradeDate),
    buyQty: Number(r.buyQty),
    sellQty: Number(r.sellQty),
    netQty: Number(r.netQty),
    buyAmt: Number(r.buyAmt),
    sellAmt: Number(r.sellAmt),
    netAmt: Number(r.netAmt),
    status: String(r.status),
  }));

  // Get total traded quantity per day for accuracy validation
  const totalByDate = new Map<string, { buyQty: number; sellQty: number }>();
  for (const day of days) {
    const t = await db.execute({
      sql: `SELECT SUM(buyQty) as totalBuy, SUM(sellQty) as totalSell
            FROM broker_daily_agg WHERE tradeDate = ? AND stockSymbol = ?`,
      args: [day.date, sym],
    });
    totalByDate.set(day.date, {
      buyQty: Number(t.rows[0]?.totalBuy ?? 0),
      sellQty: Number(t.rows[0]?.totalSell ?? 0),
    });
  }

  return Response.json({
    brokerCode,
    symbol: sym,
    dateRange: {
      from: effectiveFrom,
      to: effectiveTo,
      earliestTracked: minDate !== "1970-01-01" ? minDate : null,
      latestTracked: String(dateRange.rows[0]?.maxDate ?? ""),
    },
    cumulativeQty,
    cumulativeAmt,
    note: `Net flow since ${minDate !== "1970-01-01" ? minDate : effectiveFrom}, not total custodial holding`,
    days,
    accuracy: days.map((d) => {
      const t = totalByDate.get(d.date);
      if (!t) return { date: d.date, valid: true };
      return {
        date: d.date,
        totalBuyQty: t.buyQty,
        totalSellQty: t.sellQty,
        valid: Math.abs(t.buyQty - t.sellQty) <= 1,
      };
    }),
  });
}
