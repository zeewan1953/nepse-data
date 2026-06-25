import { db } from "@/lib/db";
import { getAvailableDates } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

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
      // Use explicit date or today — do NOT fallback yet
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
        source: "merolagani",
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

async function handleDbQuery(effectiveDate: string, dateArgs: string[], rangeMode: boolean, fromParam: string, toParam: string, brokerParam: string | null, stockParam: string | null) {
  const dateFilter = rangeMode ? "tradeDate >= ? AND tradeDate <= ?" : "tradeDate = ?";

  const wheres = [dateFilter];
  const params = [...dateArgs];
  if (brokerParam) { wheres.push("brokerId = ?"); params.push(brokerParam); }
  if (stockParam) { wheres.push("stockSymbol = ?"); params.push(stockParam); }

  const whereClause = wheres.join(" AND ");

  const rows = await db.execute({
    sql: `SELECT brokerId, stockSymbol, SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt, SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt, SUM(netQty) as netQty, SUM(netAmt) as netAmt FROM broker_daily_agg WHERE ${whereClause} GROUP BY brokerId, stockSymbol ORDER BY ABS(SUM(netAmt)) DESC`,
    args: params,
  });

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

  const stocks = rows.rows.map((r) => {
    const bk = String(r.brokerId);
    const sk = String(r.stockSymbol);
    const cum = cumMap.get(bk)?.get(sk);
    return {
      brokerId: bk,
      stockSymbol: sk,
      buyQty: Number(r.buyQty),
      buyAmt: Number(r.buyAmt),
      sellQty: Number(r.sellQty),
      sellAmt: Number(r.sellAmt),
      netQty: Number(r.netQty),
      netAmt: Number(r.netAmt),
      cumulativeNetQty: cum?.netQty ?? null,
      cumulativeNetAmt: cum?.netAmt ?? null,
    };
  });

  const brokerRows = await db.execute("SELECT DISTINCT brokerId FROM broker_daily_agg ORDER BY brokerId");
  const brokers = brokerRows.rows.map((r) => String(r.brokerId));

  const brokerSumMap = new Map<string, { buyAmt: number; sellAmt: number; netAmt: number; buyQty: number; sellQty: number }>();
  for (const s of stocks) {
    let bs = brokerSumMap.get(s.brokerId);
    if (!bs) { bs = { buyAmt: 0, sellAmt: 0, netAmt: 0, buyQty: 0, sellQty: 0 }; brokerSumMap.set(s.brokerId, bs); }
    bs.buyAmt += s.buyAmt; bs.sellAmt += s.sellAmt; bs.netAmt += s.netAmt;
    bs.buyQty += s.buyQty; bs.sellQty += s.sellQty;
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
  };
}
