import { db } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let effectiveDate: string;
  let rangeMode = false;

  if (fromParam && toParam) {
    effectiveDate = `${fromParam} – ${toParam}`;
    rangeMode = true;
  } else {
    effectiveDate = date || todayStr();
  }

  // Range mode — only DB
  if (rangeMode) {
    return Response.json(await handleDb(effectiveDate, fromParam!, toParam!, true));
  }

  // Try DB first
  const dbResult = await handleDb(effectiveDate, effectiveDate, effectiveDate, false);
  if (dbResult.status === "finalized" || dbResult.status === "pending") {
    return Response.json(dbResult);
  }

  // DB empty — try MeroLagani live
  const mero = await fetchMeroLaganiSummary();
  if (mero?.broker?.detail?.length) {
    const meroDate = (mero.broker.date || mero.overall?.d || effectiveDate).slice(0, 10).replace(/\//g, "-");
    const brokers = mero.broker.detail.map((b, idx) => {
      const buyAmt = Number(b.p) || 0;
      const sellAmt = Number(b.s) || 0;
      const netAmt = Number(b.m) || 0;
      return {
        brokerId: b.b,
        buyAmt: Math.round(buyAmt * 100) / 100,
        sellAmt: Math.round(sellAmt * 100) / 100,
        netAmt: Math.round(netAmt * 100) / 100,
        cumulativeNet: null,
        holdingPct: null,
        note: null,
        rank: idx + 1,
      };
    });

    const totalBuyAmt = Math.round(brokers.reduce((a, b) => a + b.buyAmt, 0) * 100) / 100;
    const totalSellAmt = Math.round(brokers.reduce((a, b) => a + b.sellAmt, 0) * 100) / 100;
    const totalNetAmt = Math.round(brokers.reduce((a, b) => a + b.netAmt, 0) * 100) / 100;

    return Response.json({
      date: meroDate,
      status: "finalized",
      source: "merolagani",
      brokers,
      totalBuyAmt,
      totalSellAmt,
      totalNetAmt,
    });
  }

  return Response.json(dbResult);
}

async function handleDb(effectiveDate: string, dateFrom: string, dateTo: string, rangeMode: boolean) {
  let hasFin = true;
  try { await db.execute("SELECT finalized FROM broker_daily_agg LIMIT 1"); } catch { hasFin = false; }
  const fin = (s: string) => hasFin ? s : s.replace(/AND finalized\s*=\s*\d+/g, "").replace(/WHERE finalized\s*=\s*\d+/g, "");

  const dateFilter = rangeMode ? "tradeDate >= ? AND tradeDate <= ?" : "tradeDate = ?";
  const dateArgs = rangeMode ? [dateFrom, dateTo] : [effectiveDate];

  const anyResult = await db.execute({ sql: `SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE ${dateFilter}`, args: dateArgs });
  if (Number(anyResult.rows[0]?.cnt ?? 0) === 0) {
    const r = await db.execute("SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate DESC LIMIT 1");
    return { date: effectiveDate, status: "empty", message: "No data for this date", latestDate: r.rows[0]?.tradeDate ?? null, brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 };
  }

  const aggResult = await db.execute({
    sql: `SELECT brokerId, SUM(buyAmt) as buyAmt, SUM(sellAmt) as sellAmt, SUM(netAmt) as netAmt FROM broker_daily_agg WHERE ${dateFilter} GROUP BY brokerId ORDER BY ABS(SUM(netAmt)) DESC`,
    args: dateArgs,
  });
  if (aggResult.rows.length === 0) {
    return { date: effectiveDate, status: "empty", brokers: [], totalBuyAmt: 0, totalSellAmt: 0, totalNetAmt: 0 };
  }

  const edr = await db.execute({ sql: fin("SELECT MIN(tradeDate) as d FROM broker_daily_agg WHERE finalized = 1") });
  const earliestDate = String(edr.rows[0]?.d ?? effectiveDate);
  const cumTo = rangeMode ? dateTo : effectiveDate;
  const cumResult = await db.execute({ sql: fin("SELECT brokerId, SUM(netAmt) as cumulativeNet FROM broker_daily_agg WHERE tradeDate >= ? AND tradeDate <= ? AND finalized = 1 GROUP BY brokerId"), args: [earliestDate, cumTo] });

  const cumMap = new Map<string, number>();
  for (const row of cumResult.rows) cumMap.set(String(row.brokerId), Number(row.cumulativeNet));

  const maxAbsNet = Math.max(...aggResult.rows.map((r) => Math.abs(Number(r.netAmt))), 1);
  let totalBuyAmt = 0, totalSellAmt = 0, totalNetAmt = 0;

  const brokers = aggResult.rows.map((row, idx) => {
    const brokerId = String(row.brokerId), buyAmt = Number(row.buyAmt), sellAmt = Number(row.sellAmt), netAmt = Number(row.netAmt);
    const cumulativeNet = cumMap.get(brokerId) ?? null;
    totalBuyAmt += buyAmt; totalSellAmt += sellAmt; totalNetAmt += netAmt;
    return {
      brokerId,
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: cumulativeNet !== null ? Math.round(cumulativeNet * 100) / 100 : null,
      holdingPct: cumulativeNet !== null ? Math.round((Math.abs(cumulativeNet) / maxAbsNet) * 100) : null,
      note: null,
      rank: idx + 1,
    };
  });

  return {
    date: effectiveDate,
    source: "floorsheet",
    status: "finalized",
    brokers,
    totalBuyAmt: Math.round(totalBuyAmt * 100) / 100,
    totalSellAmt: Math.round(totalSellAmt * 100) / 100,
    totalNetAmt: Math.round(totalNetAmt * 100) / 100,
  };
}
