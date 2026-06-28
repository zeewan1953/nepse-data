import { execute, getAvailableDates } from "@/lib/db";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Build response from MeroLagani live data
async function buildMeroResponse(date: string) {
  const mero = await fetchMeroLaganiSummary();
  if (!mero || !mero.broker?.detail?.length) return null;

  const brokers = mero.broker.detail;
  const stocks = mero.turnover?.detail || [];
  const overall = mero.overall || {};

  const netFlow = brokers.map(b => ({
    id: b.b,
    buyQty: 0,
    buyAmt: Number(b.p) || 0,
    sellQty: 0,
    sellAmt: Number(b.s) || 0,
    netQty: 0,
    netAmt: Number(b.m) || 0,
  }));

  const stockList = stocks.map(s => ({
    symbol: s.s,
    name: s.n || "",
    qty: Number(s.q) || 0,
    amount: Number(s.t) || 0,
    trades: 0,
  }));

  const totalQty = stockList.reduce((a, s) => a + s.qty, 0);
  const totalAmount = stockList.reduce((a, s) => a + s.amount, 0);

  const dates: string[] = [date];
  const dbDates = await getAvailableDates();
  for (const d of dbDates) {
    if (!dates.includes(d)) dates.push(d);
  }

  return {
    date,
    source: "verified",
    totals: {
      trades: Number(overall.tn) || 0,
      qty: totalQty,
      amount: totalAmount,
      brokers: netFlow.length,
      stocks: stockList.length,
    },
    netFlow: [...netFlow].sort((a, b) => b.netAmt - a.netAmt),
    topBuyers: [...netFlow].sort((a, b) => b.buyAmt - a.buyAmt).slice(0, 10),
    topSellers: [...netFlow].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, 10),
    stocks: [...stockList].sort((a, b) => b.amount - a.amount),
    dates: dates.sort().reverse(),
  };
}

// Aggregate MeroLagani broker data from DB for a date range
async function buildMeroDbRangeResponse(from: string, to: string) {
  const rows = await execute(
    `SELECT brokerCode, SUM(purchaseAmt) as buyAmt, SUM(sellAmt) as sellAmt, SUM(netAmt) as netAmt, SUM(totalAmt) as totalAmt
     FROM merolagani_broker_daily WHERE tradeDate >= ? AND tradeDate <= ?
     GROUP BY brokerCode ORDER BY SUM(netAmt) DESC`,
    [from, to],
  );
  if (!rows.rows.length) return null;

  const netFlow = rows.rows.map((r: any) => ({
    id: String(r.brokerCode),
    buyQty: 0, sellQty: 0, netQty: 0,
    buyAmt: Number(r.buyAmt),
    sellAmt: Number(r.sellAmt),
    netAmt: Number(r.netAmt),
  }));

  // Get stock totals from floorsheet_trades (volume only, no broker breakdown)
  const stockRows = await execute(
    "SELECT stockSymbol, securityName, SUM(contractQuantity) as qty, SUM(contractAmount) as amount, COUNT(*) as trades FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ? GROUP BY stockSymbol ORDER BY SUM(contractAmount) DESC",
    [from, to],
  );

  const stocks = stockRows.rows.map((r: any) => ({
    symbol: String(r.stockSymbol),
    name: String(r.securityName),
    qty: Number(r.qty),
    amount: Number(r.amount),
    trades: Number(r.trades),
  }));

  const totalQty = stocks.reduce((a: number, s: any) => a + s.qty, 0);
  const totalAmount = stocks.reduce((a: number, s: any) => a + s.amount, 0);

  return {
    date: `${from} – ${to}`,
    source: "verified",
    totals: {
      trades: stocks.reduce((a: number, s: any) => a + s.trades, 0),
      qty: totalQty,
      amount: totalAmount,
      brokers: netFlow.length,
      stocks: stocks.length,
    },
    netFlow,
    topBuyers: [...netFlow].sort((a: any, b: any) => b.buyAmt - a.buyAmt).slice(0, 10),
    topSellers: [...netFlow].sort((a: any, b: any) => b.sellAmt - a.sellAmt).slice(0, 10),
    stocks,
    dates: await getAvailableDates(),
  };
}

// Build response from MeroLagani DB for a single date
async function buildMeroDbDateResponse(date: string) {
  const rows = await execute(
    "SELECT brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt FROM merolagani_broker_daily WHERE tradeDate = ? ORDER BY ABS(netAmt) DESC",
    [date],
  );
  if (!rows.rows.length) return null;

  const netFlow = rows.rows.map((r: any) => ({
    id: String(r.brokerCode),
    buyQty: 0, sellQty: 0, netQty: 0,
    buyAmt: Number(r.purchaseAmt),
    sellAmt: Number(r.sellAmt),
    netAmt: Number(r.netAmt),
  }));

  const stockRows = await execute(
    "SELECT stockSymbol, securityName, SUM(contractQuantity) as qty, SUM(contractAmount) as amount, COUNT(*) as trades FROM floorsheet_trades WHERE tradeDate = ? GROUP BY stockSymbol ORDER BY SUM(contractAmount) DESC",
    [date],
  );

  const stocks = stockRows.rows.map((r: any) => ({
    symbol: String(r.stockSymbol),
    name: String(r.securityName),
    qty: Number(r.qty),
    amount: Number(r.amount),
    trades: Number(r.trades),
  }));

  const totalQty = stocks.reduce((a: number, s: any) => a + s.qty, 0);
  const totalAmount = stocks.reduce((a: number, s: any) => a + s.amount, 0);

  return {
    date,
    source: "verified",
    totals: {
      trades: stocks.reduce((a: number, s: any) => a + s.trades, 0),
      qty: totalQty,
      amount: totalAmount,
      brokers: netFlow.length,
      stocks: stocks.length,
    },
    netFlow,
    topBuyers: [...netFlow].sort((a: any, b: any) => b.buyAmt - a.buyAmt).slice(0, 10),
    topSellers: [...netFlow].sort((a: any, b: any) => b.sellAmt - a.sellAmt).slice(0, 10),
    stocks,
    dates: await getAvailableDates(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    let rangeMode = false;

    let date: string;
    if (fromParam && toParam) {
      date = `${fromParam} – ${toParam}`;
      rangeMode = true;
    } else {
      date = dateParam || todayStr();
    }

    // Range mode: use MeroLagani DB (has real broker codes)
    if (rangeMode) {
      const meroRange = await buildMeroDbRangeResponse(fromParam!, toParam!);
      if (meroRange) return Response.json(meroRange);
      const dates = await getAvailableDates();
      return Response.json({ date, totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 }, netFlow: [], topBuyers: [], topSellers: [], stocks: [], dates });
    }

    // Single date: MeroLagani DB first (real broker codes)
    const meroDb = await buildMeroDbDateResponse(date);
    if (meroDb) return Response.json(meroDb);

    // Fallback to live MeroLagani (real-time)
    const live = await buildMeroResponse(date);
    if (live) return Response.json(live);

    // Fallback to floorsheet_trades (has null brokers but stock data)
    const ft = await execute(
      "SELECT stockSymbol, securityName, SUM(contractQuantity) as qty, SUM(contractAmount) as amount, COUNT(*) as trades FROM floorsheet_trades WHERE tradeDate = ? GROUP BY stockSymbol ORDER BY SUM(contractAmount) DESC",
      [date],
    );
    if (ft.rows.length) {
      const stocks = ft.rows.map((r: any) => ({
        symbol: String(r.stockSymbol), name: String(r.securityName),
        qty: Number(r.qty), amount: Number(r.amount), trades: Number(r.trades),
      }));
      const totalQty = stocks.reduce((a: number, s: any) => a + s.qty, 0);
      const totalAmount = stocks.reduce((a: number, s: any) => a + s.amount, 0);
      const dates = await getAvailableDates();
      return Response.json({
        date, source: "floorsheet",
        totals: { trades: stocks.reduce((a: number, s: any) => a + s.trades, 0), qty: totalQty, amount: totalAmount, brokers: 0, stocks: stocks.length },
        netFlow: [], topBuyers: [], topSellers: [], stocks, dates,
        note: "Broker IDs not available from NEPSE, showing stock aggregates only",
      });
    }

    // Fallback to latest available date
    const fallback = await getTargetDateWithFallback(date);
    if (fallback.date !== date) {
      const fb = await buildMeroDbDateResponse(fallback.date);
      if (fb) return Response.json({ ...fb, fallbackNote: `No data for ${date}, showing ${fallback.date}` });
    }

    const dates = await getAvailableDates();
    return Response.json({ date, totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 }, netFlow: [], topBuyers: [], topSellers: [], stocks: [], dates });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
