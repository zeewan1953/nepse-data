import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string; symbol: string }> }) {
  const { code, symbol } = await params;
  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const windowDays = Math.min(Math.max(parseInt(daysParam || "10", 10) || 10, 1), 60);

  // Check finalized column once
  let hasFin = true;
  try { await db.execute("SELECT finalized FROM broker_daily_agg LIMIT 1"); } catch { hasFin = false; }
  const fin = (s: string) => hasFin ? s : s.replace(/AND finalized\s*=\s*\d+/g, "").replace(/WHERE finalized\s*=\s*\d+/g, "");

  // Get the most recent finalized trading days for this symbol
  const datesResult = await db.execute({
    sql: fin(`SELECT DISTINCT tradeDate FROM broker_daily_agg WHERE stockSymbol = ? AND finalized = 1 ORDER BY tradeDate DESC LIMIT ?`),
    args: [symbol.toUpperCase(), windowDays],
  });

  if (datesResult.rows.length === 0) {
    return Response.json({
      brokerCode: code,
      symbol: symbol.toUpperCase(),
      windowDays,
      status: "empty",
      note: "No finalized data available for this symbol",
      dailyNet: [], footprint: null,
    });
  }

  const dates = datesResult.rows.map((r) => String(r.tradeDate)).sort();

  // Check all days are finalized
  if (hasFin) {
    const nonFinResult = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE stockSymbol = ? AND tradeDate IN (${dates.map(() => "?").join(",")}) AND finalized != 1`,
      args: [symbol.toUpperCase(), ...dates],
    });
    if (Number(nonFinResult.rows[0]?.cnt ?? 0) > 0) {
      return Response.json({
        brokerCode: code,
        symbol: symbol.toUpperCase(),
        windowDays, status: "incomplete",
        note: "One or more days in the window are still provisional",
        dailyNet: [], footprint: null,
      });
    }
  }

  // Get the broker's daily net for this symbol across those dates
  const dailyResult = await db.execute({
    sql: `SELECT tradeDate, buyQty, sellQty, netQty, buyAmt, sellAmt, netAmt
          FROM broker_daily_agg
          WHERE brokerId = ? AND stockSymbol = ? AND tradeDate IN (${dates.map(() => "?").join(",")})
          ORDER BY tradeDate ASC`,
    args: [code, symbol.toUpperCase(), ...dates],
  });

  // For days the broker didn't trade, net_qty = 0
  const tradedDates = new Set(dailyResult.rows.map((r) => String(r.tradeDate)));
  const dailyNet = dates.map((d) => {
    if (tradedDates.has(d)) {
      const row = dailyResult.rows.find((r) => String(r.tradeDate) === d)!;
      return {
        date: d,
        buyQty: Number(row.buyQty),
        sellQty: Number(row.sellQty),
        netQty: Number(row.netQty),
        buyAmt: Number(row.buyAmt),
        sellAmt: Number(row.sellAmt),
        netAmt: Number(row.netAmt),
      };
    }
    return { date: d, buyQty: 0, sellQty: 0, netQty: 0, buyAmt: 0, sellAmt: 0, netAmt: 0 };
  });

  // Compute footprint (derived fields per Section 9.2)
  const netSeries = dailyNet.map((d) => d.netQty);
  const cumulativeNet = netSeries.reduce((s, v) => s + v, 0);

  let streakLength = 0;
  let streakDirection: number | null = null;
  for (let i = netSeries.length - 1; i >= 0; i--) {
    const sign = Math.sign(netSeries[i]);
    if (sign === 0) break;
    if (streakDirection === null) streakDirection = sign;
    if (sign !== streakDirection) break;
    streakLength++;
  }

  let flips = 0;
  for (let i = 1; i < netSeries.length; i++) {
    const prevSign = Math.sign(netSeries[i - 1]);
    const curSign = Math.sign(netSeries[i]);
    if (prevSign !== 0 && curSign !== 0 && prevSign !== curSign) flips++;
  }

  let pattern: string;
  if (dailyNet.length < 5) {
    pattern = "insufficient_history";
  } else if (streakLength >= dailyNet.length - 1) {
    pattern = streakDirection && streakDirection > 0 ? "consistent_buyer" : "consistent_seller";
  } else if (flips >= dailyNet.length - 3) {
    pattern = "rotating";
  } else {
    pattern = "mixed";
  }

  const footprint = {
    cumulativeNet: Math.round(cumulativeNet * 100) / 100,
    streakLength,
    streakDirection,
    flips,
    pattern,
    windowDays: dailyNet.length,
  };

  return Response.json({
    brokerCode: code,
    symbol: symbol.toUpperCase(),
    windowDays,
    status: "finalized",
    note: "Net flow from finalized floorsheet data, not total custodial holding",
    dailyNet,
    footprint,
  });
}
