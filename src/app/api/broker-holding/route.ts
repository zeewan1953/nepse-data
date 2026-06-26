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

  // Range mode — use MeroLagani DB
  if (rangeMode) {
    const meroResult = await handleMeroDbRange(fromParam!, toParam!);
    if (meroResult) return Response.json({ ...meroResult, date: effectiveDate });
    const dbResult = await handleDb(effectiveDate, fromParam!, toParam!, true);
    return Response.json(dbResult);
  }

  // Single date: MeroLagani DB first
  const meroResult = await handleMeroDb(effectiveDate);
  if (meroResult) return Response.json(meroResult);

  // DB fallback
  const dbResult = await handleDb(effectiveDate, effectiveDate, effectiveDate, false);
  if (dbResult.status === "finalized" || dbResult.status === "pending") {
    return Response.json(dbResult);
  }

  // Live MeroLagani
  const mero = await fetchMeroLaganiSummary();
  if (mero?.broker?.detail?.length) {
    const brokers = mero.broker.detail.map((b: any, idx: number) => {
      const buyAmt = Number(b.p) || 0;
      const sellAmt = Number(b.s) || 0;
      const netAmt = Number(b.m) || 0;
      return {
        brokerId: b.b,
        buyAmt: Math.round(buyAmt * 100) / 100,
        sellAmt: Math.round(sellAmt * 100) / 100,
        netAmt: Math.round(netAmt * 100) / 100,
        cumulativeNet: null, holdingPct: null, note: null, rank: idx + 1,
      };
    });

    const totalBuyAmt = Math.round(brokers.reduce((a: number, b: any) => a + b.buyAmt, 0) * 100) / 100;
    const totalSellAmt = Math.round(brokers.reduce((a: number, b: any) => a + b.sellAmt, 0) * 100) / 100;
    const totalNetAmt = Math.round(brokers.reduce((a: number, b: any) => a + b.netAmt, 0) * 100) / 100;

    return Response.json({
      date: effectiveDate, status: "finalized", source: "merolagani",
      brokers, totalBuyAmt, totalSellAmt, totalNetAmt,
    });
  }

  return Response.json(dbResult);
}

// MeroLagani DB for single date
async function handleMeroDb(date: string) {
  const rows = await db.execute({
    sql: "SELECT brokerCode, purchaseAmt, sellAmt, netAmt FROM merolagani_broker_daily WHERE tradeDate = ? ORDER BY ABS(netAmt) DESC",
    args: [date],
  });
  if (!rows.rows.length) return null;

  let totalBuyAmt = 0, totalSellAmt = 0, totalNetAmt = 0;
  const brokers = rows.rows.map((r: any, idx: number) => {
    const buyAmt = Number(r.purchaseAmt);
    const sellAmt = Number(r.sellAmt);
    const netAmt = Number(r.netAmt);
    totalBuyAmt += buyAmt; totalSellAmt += sellAmt; totalNetAmt += netAmt;
    return {
      brokerId: String(r.brokerCode),
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: null, holdingPct: null, note: null, rank: idx + 1,
    };
  });

  return {
    date, status: "finalized", source: "merolagani",
    brokers,
    totalBuyAmt: Math.round(totalBuyAmt * 100) / 100,
    totalSellAmt: Math.round(totalSellAmt * 100) / 100,
    totalNetAmt: Math.round(totalNetAmt * 100) / 100,
  };
}

// MeroLagani DB for date range
async function handleMeroDbRange(from: string, to: string) {
  const rows = await db.execute({
    sql: "SELECT brokerCode, SUM(purchaseAmt) as buyAmt, SUM(sellAmt) as sellAmt, SUM(netAmt) as netAmt FROM merolagani_broker_daily WHERE tradeDate >= ? AND tradeDate <= ? GROUP BY brokerCode ORDER BY ABS(SUM(netAmt)) DESC",
    args: [from, to],
  });
  if (!rows.rows.length) return null;

  let totalBuyAmt = 0, totalSellAmt = 0, totalNetAmt = 0;
  const brokers = rows.rows.map((r: any, idx: number) => {
    const buyAmt = Number(r.buyAmt);
    const sellAmt = Number(r.sellAmt);
    const netAmt = Number(r.netAmt);
    totalBuyAmt += buyAmt; totalSellAmt += sellAmt; totalNetAmt += netAmt;
    return {
      brokerId: String(r.brokerCode),
      buyAmt: Math.round(buyAmt * 100) / 100,
      sellAmt: Math.round(sellAmt * 100) / 100,
      netAmt: Math.round(netAmt * 100) / 100,
      cumulativeNet: null, holdingPct: null, note: null, rank: idx + 1,
    };
  });

  return {
    status: "finalized", source: "merolagani",
    brokers,
    totalBuyAmt: Math.round(totalBuyAmt * 100) / 100,
    totalSellAmt: Math.round(totalSellAmt * 100) / 100,
    totalNetAmt: Math.round(totalNetAmt * 100) / 100,
  };
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

  const brokers = aggResult.rows.map((row: any, idx: number) => {
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
