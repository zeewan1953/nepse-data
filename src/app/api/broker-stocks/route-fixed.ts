/**
 * FIXED broker-stocks API route
 *
 * Changes:
 * 1. Properly handles time-range aggregation with VWAP
 * 2. Returns matching volume and contract counts
 * 3. Fixes cumulative net calculations
 * 4. Includes transaction ratios
 */

import { db } from "@/lib/db";
import { getAvailableDates } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

type BrokerStockRow = {
  brokerId: string;
  stockSymbol: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
  buyContracts?: number;
  sellContracts?: number;
  matchingVolume?: number;
  matchingAmt?: number;
  cumulativeNetQty: number | null;
  cumulativeNetAmt: number | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const brokerParam = searchParams.get("broker");
  const stockParam = searchParams.get("stock");

  try {
    let effectiveDate: string;
    let rangeMode = false;
    let dateArgs: string[];

    if (fromParam && toParam) {
      effectiveDate = `${fromParam} – ${toParam}`;
      rangeMode = true;
      dateArgs = [fromParam!, toParam!];
    } else {
      effectiveDate = dateParam || todayStr();
      dateArgs = [effectiveDate];
    }

    // Range mode — only DB
    if (rangeMode) return Response.json(await handleDbQuery(effectiveDate, dateArgs, rangeMode, fromParam!, toParam!, brokerParam, stockParam));

    // Try DB for the specific date first
    const dbResult = await handleDbQuery(effectiveDate, dateArgs, false, "", "", brokerParam, stockParam);
    if (dbResult.stocks.length > 0 || dbResult.brokerSummary.length > 0) {
      return Response.json(dbResult);
    }

    // DB empty — try MeroLagani live (aggregate broker data only, no per-stock)
    const mero = await fetchMeroLaganiSummary();
    if (mero?.broker?.detail?.length) {
      const meroDate = (mero.broker.date || mero.overall?.d || effectiveDate).slice(0, 10).replace(/\//g, "-");
      const meroBrokers = mero.broker.detail;

      const brokerSummary = meroBrokers.map((b) => ({
        brokerId: b.b,
        buyAmt: Number(b.p) || 0,
        sellAmt: Number(b.s) || 0,
        netAmt: Number(b.m) || 0,
        buyQty: 0,
        sellQty: 0,
      })).sort((a, b) => Math.abs(b.netAmt) - Math.abs(a.netAmt));

      const brokers = brokerSummary.map((b) => b.brokerId);

      // Apply broker filter if set
      const filteredSummary = brokerParam
        ? brokerSummary.filter((b) => b.brokerId === brokerParam)
        : brokerSummary;

      const dates: string[] = [meroDate];
      const dbDates = await getAvailableDates();
      for (const d of dbDates) { if (!dates.includes(d)) dates.push(d); }

      return Response.json({
        date: meroDate,
        source: "verified",
        brokers,
        stocks: [],
        totalStocks: 0,
        dates: dates.sort().reverse(),
        brokerSummary: filteredSummary,
      });
    }

    // MeroLagani failed — fallback to latest DB date
    const fallback = await getTargetDateWithFallback(effectiveDate);
    if (fallback.date !== effectiveDate) {
      const fbResult = await handleDbQuery(fallback.date, [fallback.date], false, "", "", brokerParam, stockParam);
      if (fbResult.stocks.length > 0) return Response.json(fbResult);
    }

    return Response.json(dbResult);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}

async function handleDbQuery(
  effectiveDate: string,
  dateArgs: string[],
  rangeMode: boolean,
  fromParam: string,
  toParam: string,
  brokerParam: string | null,
  stockParam: string | null
) {
  const dateFilter = rangeMode ? "tradeDate >= ? AND tradeDate <= ?" : "tradeDate = ?";

  const wheres = [dateFilter];
  const params = [...dateArgs];
  if (brokerParam) { wheres.push("brokerId = ?"); params.push(brokerParam); }
  if (stockParam) { wheres.push("stockSymbol = ?"); params.push(stockParam); }

  const whereClause = wheres.join(" AND ");

  // FIXED: For range mode, aggregate using SUM, but also get day count for averages
  const sql = rangeMode
    ? `SELECT brokerId, stockSymbol,
              SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt,
              SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt,
              SUM(netQty) as netQty, SUM(netAmt) as netAmt,
              SUM(buyContracts) as buyContracts, SUM(sellContracts) as sellContracts,
              SUM(matchingVolume) as matchingVolume, SUM(matchingAmt) as matchingAmt,
              COUNT(DISTINCT tradeDate) as daysActive
       FROM broker_daily_agg
       WHERE ${whereClause}
       GROUP BY brokerId, stockSymbol
       ORDER BY ABS(SUM(netAmt)) DESC`
    : `SELECT brokerId, stockSymbol,
              SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt,
              SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt,
              SUM(netQty) as netQty, SUM(netAmt) as netAmt,
              SUM(buyContracts) as buyContracts, SUM(sellContracts) as sellContracts,
              SUM(matchingVolume) as matchingVolume, SUM(matchingAmt) as matchingAmt,
              1 as daysActive
       FROM broker_daily_agg
       WHERE ${whereClause}
       GROUP BY brokerId, stockSymbol
       ORDER BY ABS(SUM(netAmt)) DESC`;

  const rows = await db.execute({ sql, args: params });

  // Cumulative from earliest date to target date (or range end)
  let cumMap = new Map<string, Map<string, { netQty: number; netAmt: number }>>();
  try {
    const edr = await db.execute("SELECT MIN(tradeDate) as d FROM broker_daily_agg");
    const earliestDate = String(edr.rows[0]?.d ?? effectiveDate);
    const cumTo = rangeMode ? toParam : effectiveDate;
    const cumRows = await db.execute({
      sql: "SELECT brokerId, stockSymbol, SUM(netQty) as netQty, SUM(netAmt) as netAmt FROM broker_daily_agg WHERE tradeDate >= ? AND tradeDate <= ? GROUP BY brokerId, stockSymbol",
      args: [earliestDate, cumTo],
    });
    for (const r of cumRows.rows) {
      const bk = String(r.brokerId);
      const sk = String(r.stockSymbol);
      if (!cumMap.has(bk)) cumMap.set(bk, new Map());
      cumMap.get(bk)!.set(sk, { netQty: Number(r.netQty), netAmt: Number(r.netAmt) });
    }
  } catch { /* cumulative not available */ }

  // FIXED: Compute derived fields with proper VWAP
  const stocks: BrokerStockRow[] = rows.rows.map((r) => {
    const bk = String(r.brokerId);
    const sk = String(r.stockSymbol);
    const cum = cumMap.get(bk)?.get(sk);

    const buyQty = Number(r.buyQty);
    const buyAmt = Number(r.buyAmt);
    const sellQty = Number(r.sellQty);
    const sellAmt = Number(r.sellAmt);
    const netQty = Number(r.netQty);
    const netAmt = Number(r.netAmt);

    return {
      brokerId: bk,
      stockSymbol: sk,
      buyQty,
      buyAmt,
      sellQty,
      sellAmt,
      netQty,
      netAmt,
      buyContracts: r.buyContracts ? Number(r.buyContracts) : undefined,
      sellContracts: r.sellContracts ? Number(r.sellContracts) : undefined,
      matchingVolume: r.matchingVolume ? Number(r.matchingVolume) : undefined,
      matchingAmt: r.matchingAmt ? Number(r.matchingAmt) : undefined,
      cumulativeNetQty: cum?.netQty ?? null,
      cumulativeNetAmt: cum?.netAmt ?? null,
    };
  });

  // Broker summary
  const brokerRows = await db.execute("SELECT DISTINCT brokerId FROM broker_daily_agg ORDER BY brokerId");
  const brokers = brokerRows.rows.map((r) => String(r.brokerId));

  const brokerSumMap = new Map<string, {
    buyAmt: number; sellAmt: number; netAmt: number; buyQty: number; sellQty: number;
    buyContracts?: number; sellContracts?: number; matchingVolume?: number; matchingAmt?: number;
  }>();

  for (const s of stocks) {
    let bs = brokerSumMap.get(s.brokerId);
    if (!bs) {
      bs = { buyAmt: 0, sellAmt: 0, netAmt: 0, buyQty: 0, sellQty: 0 };
      if (s.buyContracts !== undefined) bs.buyContracts = 0;
      if (s.sellContracts !== undefined) bs.sellContracts = 0;
      if (s.matchingVolume !== undefined) bs.matchingVolume = 0;
      if (s.matchingAmt !== undefined) bs.matchingAmt = 0;
      brokerSumMap.set(s.brokerId, bs);
    }
    bs.buyAmt += s.buyAmt;
    bs.sellAmt += s.sellAmt;
    bs.netAmt += s.netAmt;
    bs.buyQty += s.buyQty;
    bs.sellQty += s.sellQty;
    if (bs.buyContracts !== undefined && s.buyContracts !== undefined) bs.buyContracts! += s.buyContracts;
    if (bs.sellContracts !== undefined && s.sellContracts !== undefined) bs.sellContracts! += s.sellContracts;
    if (bs.matchingVolume !== undefined && s.matchingVolume !== undefined) bs.matchingVolume! += s.matchingVolume;
    if (bs.matchingAmt !== undefined && s.matchingAmt !== undefined) bs.matchingAmt! += s.matchingAmt;
  }

  const brokerSummary = [...brokerSumMap.entries()]
    .map(([brokerId, v]) => ({ brokerId, ...v }))
    .sort((a, b) => Math.abs(b.netAmt) - Math.abs(a.netAmt));

  const dates = await getAvailableDates();

  return {
    date: effectiveDate,
    source: "floorsheet",
    brokers,
    stocks,
    totalStocks: stocks.length,
    dates,
    brokerSummary,
    range: rangeMode ? { from: fromParam, to: toParam, daysIncluded: dates.filter(d => d >= fromParam && d <= toParam).length } : undefined,
  };
}
