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
    source: "merolagani",
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

// Date overview: aggregate broker & stock stats from DB for a given date or date range
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    
    let date: string;
    let rangeMode = false;

    if (fromParam && toParam) {
      date = `${fromParam} – ${toParam}`;
      rangeMode = true;
    } else {
      // Use the explicit date or today — do NOT fallback to latest DB date yet
      date = dateParam || todayStr();
    }

    // Range queries always use DB
    if (rangeMode) {
      const trades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ?",
        [fromParam!, toParam!],
      );
      if (!trades.rows.length) {
        const dates = await getAvailableDates();
        return Response.json({ date, totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 }, netFlow: [], topBuyers: [], topSellers: [], stocks: [], dates });
      }
      const totals = aggregateTrades(trades.rows, date);
      return Response.json({ ...totals, dates: await getAvailableDates() });
    }

    // Single date: try DB for this specific date
    const trades = await execute(
      "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
      [date],
    );

    if (trades.rows.length) {
      const totals = aggregateTrades(trades.rows, date);
      return Response.json({ ...totals, source: "floorsheet", dates: await getAvailableDates() });
    }

    // DB empty for this date — try MeroLagani live data
    const live = await buildMeroResponse(date);
    if (live) return Response.json(live);

    // MeroLagani also failed — fallback to latest available date in DB
    const fallback = await getTargetDateWithFallback(date);
    if (fallback.date !== date) {
      const fbTrades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
        [fallback.date],
      );
      if (fbTrades.rows.length) {
        const totals = aggregateTrades(fbTrades.rows, fallback.date);
        return Response.json({ ...totals, source: "floorsheet", fallbackNote: `No data for ${date}, showing ${fallback.date}`, dates: await getAvailableDates() });
      }
    }

    // Nothing at all
    const dates = await getAvailableDates();
    return Response.json({ date, totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 }, netFlow: [], topBuyers: [], topSellers: [], stocks: [], dates });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}

function aggregateTrades(rows: any[], date: string) {
  const brokerMap = new Map<string, { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>();
  const stockMap = new Map<string, { symbol: string; name: string; qty: number; amount: number; trades: number }>();
  let totalQty = 0, totalAmount = 0;

  const getB = (id: string) => brokerMap.get(id) ?? { id, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };

  for (const r of rows) {
    const qty = Number(r.contractQuantity);
    const amt = Number(r.contractAmount);
    const sym = String(r.stockSymbol);
    const name = String(r.securityName);
    const buyer = String(r.buyerMemberId);
    const seller = String(r.sellerMemberId);

    totalQty += qty;
    totalAmount += amt;

    const b = getB(buyer); b.buyQty += qty; b.buyAmt += amt; brokerMap.set(buyer, b);
    const s = getB(seller); s.sellQty += qty; s.sellAmt += amt; brokerMap.set(seller, s);

    const st = stockMap.get(sym) ?? { symbol: sym, name, qty: 0, amount: 0, trades: 0 };
    st.qty += qty; st.amount += amt; st.trades += 1;
    stockMap.set(sym, st);
  }

  const brokerList = [...brokerMap.values()].map((b) => ({
    ...b, netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt,
  }));

  return {
    date,
    source: "floorsheet",
    totals: { trades: rows.length, qty: totalQty, amount: totalAmount, brokers: brokerMap.size, stocks: stockMap.size },
    netFlow: [...brokerList].sort((a, b) => b.netAmt - a.netAmt),
    topBuyers: [...brokerList].sort((a, b) => b.buyAmt - a.buyAmt).slice(0, 10),
    topSellers: [...brokerList].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, 10),
    stocks: [...stockMap.values()].sort((a, b) => b.amount - a.amount),
  };
}
