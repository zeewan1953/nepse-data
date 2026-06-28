import "server-only";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cmf(rows: Array<{ close: number; high: number; low: number; volume: number }>, period = 7): number | null {
  if (rows.length < period) return null;
  const slice = rows.slice(-period);
  let sum = 0;
  for (const r of slice) {
    const h = r.high || 0;
    const l = r.low || 0;
    const c = r.close || 0;
    const range = h - l || 1;
    const mfm = ((c - l) - (h - c)) / range;
    sum += mfm * (r.volume || 0);
  }
  const vol = slice.reduce((s, r) => s + (r.volume || 0), 0) || 1;
  return sum / vol;
}

function mfi(rows: Array<{ close: number; high: number; low: number; volume: number }>, period = 5): number | null {
  if (rows.length < period + 1) return null;
  let pos = 0;
  let neg = 0;
  const slice = rows.slice(-period - 1);
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const curr = slice[i].close;
    const flow = curr > prev ? slice[i].volume : curr < prev ? -slice[i].volume : 0;
    if (flow > 0) pos += flow;
    else neg += Math.abs(flow);
  }
  if (neg === 0) return pos > 0 ? 100 : 50;
  const fr = pos / neg;
  return 100 - 100 / (1 + fr);
}

function volZ(rows: Array<{ volume: number }>, period = 20): number | null {
  if (rows.length < period) return null;
  const slice = rows.slice(-period).map((r) => r.volume || 0);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length) || 1;
  const last = slice[slice.length - 1];
  return (last - mean) / std;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const sort = url.searchParams.get("sort") || "turnover";
    const today = todayStr();

    let date = dateParam;
    if (!date) {
      const latest = await db.execute("SELECT MAX(tradeDate) AS d FROM broker_daily_agg");
      const latestDate = latest.rows[0]?.d ? String(latest.rows[0].d) : null;
      if (latestDate) {
        date = latestDate;
      } else {
        const latestFs = await db.execute("SELECT MAX(tradeDate) AS d FROM floorsheet_trades");
        date = latestFs.rows[0]?.d ? String(latestFs.rows[0].d) : today;
      }
    }

    // Broker totals per stock from floorsheet aggregation
    const aggRows = await db.execute({
      sql: `SELECT stockSymbol, SUM(buyAmt) as brokerBuy, SUM(sellAmt) as brokerSell,
                   SUM(netAmt) as brokerNet, SUM(buyQty + sellQty) as brokerQty
            FROM broker_daily_agg
            WHERE tradeDate = ?
            GROUP BY stockSymbol`,
      args: [date],
    });

    let brokerMap = new Map<string, { brokerBuy: number; brokerSell: number; brokerNet: number; brokerQty: number | null }>();
    for (const r of aggRows.rows as any[]) {
      brokerMap.set(String(r.stockSymbol), {
        brokerBuy: Number(r.brokerBuy) || 0,
        brokerSell: Number(r.brokerSell) || 0,
        brokerNet: Number(r.brokerNet) || 0,
        brokerQty: Number(r.brokerQty) || null,
      });
    }

    // Live stocks table
    const stockRows = await db.execute({
      sql: "SELECT symbol, lastTradedPrice, percentageChange, totalTradeQuantity FROM stocks ORDER BY totalTradeQuantity DESC",
    });

    // Fetch recent OHLCV for all symbols for technical indicators
    const symbols = stockRows.rows.map((r: any) => String(r.symbol));
    const placeholders = symbols.map(() => "?").join(",");
    const ohlcvRows = await db.execute({
      sql: `SELECT symbol, tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv WHERE symbol IN (${placeholders}) ORDER BY symbol, tradeDate ASC`,
      args: symbols,
    });

    // Group OHLCV by symbol
    const ohlcvBySymbol = new Map<string, Array<{ tradeDate: string; open: number; high: number; low: number; close: number; volume: number }>>();
    for (const r of ohlcvRows.rows as any[]) {
      const sym = String(r.symbol);
      if (!ohlcvBySymbol.has(sym)) ohlcvBySymbol.set(sym, []);
      ohlcvBySymbol.get(sym)!.push({
        tradeDate: String(r.tradeDate),
        open: Number(r.open) || 0,
        high: Number(r.high) || 0,
        low: Number(r.low) || 0,
        close: Number(r.close) || 0,
        volume: Number(r.volume) || 0,
      });
    }

    const out: any[] = [];
    for (const s of stockRows.rows as any[]) {
      const sym = String(s.symbol);
      const ltp = Number(s.lastTradedPrice) || 0;
      const qty = Number(s.totalTradeQuantity) || 0;
      const change = Number(s.percentageChange) || 0;
      const turnover = ltp * qty;
      const b = brokerMap.get(sym);
      if (!b) continue;

      const ohlcv = ohlcvBySymbol.get(sym) || [];
      const lastOhlcv = ohlcv[ohlcv.length - 1];
      const avgPrice = lastOhlcv ? (lastOhlcv.open + lastOhlcv.high + lastOhlcv.low + lastOhlcv.close) / 4 : ltp;
      const cmfVal = cmf(ohlcv);
      const mfiVal = mfi(ohlcv);
      const volZVal = volZ(ohlcv);

      let turnoverLabel = "";
      if (turnover >= 1e7) {
        turnoverLabel = `${(turnover / 1e7).toFixed(2)} Cr`;
      } else if (turnover >= 1e5) {
        turnoverLabel = `${(turnover / 1e5).toFixed(2)} L`;
      } else if (turnover >= 1000) {
        turnoverLabel = `${(turnover / 1000).toFixed(2)} K`;
      } else {
        turnoverLabel = turnover.toFixed(0);
      }

      out.push({
        symbol: sym,
        ltp,
        changePct: change,
        quantity: qty,
        turnoverLabel,
        turnover,
        avgPrice,
        brokerBuy: b.brokerBuy,
        brokerSell: b.brokerSell,
        brokerNet: b.brokerNet,
        cmf: cmfVal,
        mfi: mfiVal,
        volZ: volZVal,
      });
    }

    // Sort
    if (sort === "net") {
      out.sort((a, b) => (b.brokerNet || 0) - (a.brokerNet || 0));
    } else if (sort === "buy") {
      out.sort((a, b) => (b.brokerBuy || 0) - (a.brokerBuy || 0));
    } else if (sort === "sell") {
      out.sort((a, b) => (a.brokerSell || 0) - (b.brokerSell || 0));
    } else if (sort === "cmf") {
      out.sort((a, b) => (b.cmf || 0) - (a.cmf || 0));
    } else if (sort === "mfi") {
      out.sort((a, b) => (b.mfi || 0) - (a.mfi || 0));
    } else {
      // default: turnover
      out.sort((a, b) => b.turnover - a.turnover);
    }

    return Response.json({
      date,
      count: out.length,
      stocks: out,
      source: "database",
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
