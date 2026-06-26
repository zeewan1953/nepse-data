import "server-only";
import { execute } from "@/lib/db";
import { computeCMF, computeMFI, computeVolumeZScore } from "@/lib/broker_flow_analytics";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClassifiedTrade = {
  quantity: number;
  direction: "buy" | "sell" | "neutral";
};

function classifyTrades(
  rows: Array<{ tradeOrder: number; price: number; quantity: number }>
): ClassifiedTrade[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.tradeOrder - b.tradeOrder);
  const result: ClassifiedTrade[] = [];
  let lastDir: "buy" | "sell" = "buy";
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      result.push({ quantity: sorted[i].quantity, direction: "neutral" });
      continue;
    }
    const diff = sorted[i].price - sorted[i - 1].price;
    let dir: "buy" | "sell";
    if (diff > 0) dir = "buy";
    else if (diff < 0) dir = "sell";
    else dir = lastDir;
    lastDir = dir;
    result.push({ quantity: sorted[i].quantity, direction: dir });
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const sort = sp.get("sort") || "turnover";

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

    // Support both single date and range
    let fromDate: string;
    let toDate: string;
    if (fromParam && toParam) {
      fromDate = fromParam;
      toDate = toParam;
    } else {
      fromDate = dateParam || today;
      toDate = dateParam || today;
    }

    // Fetch all floorsheet trades for the date range
    const allRows = await execute(
      "SELECT stockSymbol, tradeOrder, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ? ORDER BY stockSymbol, tradeOrder ASC",
      [fromDate, toDate],
    );

    if (!allRows.rows.length) {
      const label = fromDate === toDate ? fromDate : `${fromDate}–${toDate}`;
      // Include available dates so the frontend can auto-select the latest
      const dateRows = await execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate DESC LIMIT 5");
      const availableDates = dateRows.rows.map((r: any) => String(r.tradeDate));
      return Response.json({ date: label, from: fromDate, to: toDate, stocks: [], source: "floorsheet", availableDates });
    }

    // Group by stock
    const stocksMap = new Map<string, Array<{ tradeOrder: number; price: number; quantity: number }>>();
    for (const r of allRows.rows) {
      const sym = String(r.stockSymbol);
      if (!stocksMap.has(sym)) stocksMap.set(sym, []);
      stocksMap.get(sym)!.push({
        tradeOrder: Number(r.tradeOrder),
        price: Number(r.contractAmount) / Math.max(1, Number(r.contractQuantity)),
        quantity: Number(r.contractQuantity),
      });
    }

    // Get OHLCV data for all these stocks for CMF/MFI/Z-score
    const symbols = [...stocksMap.keys()];
    const ohlcvRows = await execute(
      `SELECT symbol, tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv 
       WHERE symbol IN (${symbols.map(() => "?").join(",")}) 
       ORDER BY symbol, tradeDate DESC`,
      symbols,
    );

    // Group OHLCV by symbol
    const ohlcvMap = new Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>();
    for (const r of ohlcvRows.rows) {
      const sym = String(r.symbol);
      if (!ohlcvMap.has(sym)) ohlcvMap.set(sym, []);
      ohlcvMap.get(sym)!.push({
        date: String(r.tradeDate),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      });
    }

    const minTradesForEstimate = 5;
    const stocks: Array<{
      symbol: string;
      ltp: number | null;
      changePercent: number | null;
      totalVolume: number;
      totalTurnover: number;
      tradeCount: number;
      avgPrice: number | null;
      estBuyVolume: number | null;
      estSellVolume: number | null;
      estNetVolume: number | null;
      cmf: number | null;
      mfi: number | null;
      volumeZScore: number | null;
      estimateMethod: string | null;
    }> = [];

    for (const [symbol, trades] of stocksMap) {
      const totalVol = trades.reduce((a, t) => a + t.quantity, 0);
      const totalTurn = trades.reduce((a, t) => a + t.price * t.quantity, 0);
      const tc = trades.length;
      const avgP = totalVol > 0 ? totalTurn / totalVol : null;

      let estBuy: number | null = null;
      let estSell: number | null = null;
      let estNet: number | null = null;
      let estMethod: string | null = null;

      if (tc >= minTradesForEstimate) {
        const classified = classifyTrades(trades);
        let buyVol = 0, sellVol = 0;
        for (const c of classified) {
          if (c.direction === "buy") buyVol += c.quantity;
          else if (c.direction === "sell") sellVol += c.quantity;
        }
        estBuy = buyVol;
        estSell = sellVol;
        estNet = buyVol - sellVol;
        estMethod = "tick-rule";
      }

      // CMF, MFI, Z-score from OHLCV
      const ohlcv = ohlcvMap.get(symbol) || [];
      const ohlcvAsc = [...ohlcv].reverse();
      const bars = ohlcvAsc.map(o => ({
        date: o.date, open: o.open, high: o.high, low: o.low,
        close: o.close, volume: o.volume,
      }));
      const cmfVal = computeCMF(bars, 20);
      const mfiVal = computeMFI(bars, 14);
      const volZVal = computeVolumeZScore(bars, 20);

      // LTP and changePercent from OHLCV
      const ohlcvSorted = [...ohlcv].sort((a, b) => b.date.localeCompare(a.date));
      const ltp = ohlcvSorted.length > 0 ? ohlcvSorted[0].close : avgP;
      const changePercent = ohlcvSorted.length > 1
        ? ((ohlcvSorted[0].close - ohlcvSorted[1].close) / ohlcvSorted[1].close) * 100
        : null;

      stocks.push({
        symbol,
        ltp: ltp ? Math.round(ltp * 100) / 100 : null,
        changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
        totalVolume: totalVol,
        totalTurnover: totalTurn,
        tradeCount: tc,
        avgPrice: avgP,
        estBuyVolume: estBuy,
        estSellVolume: estSell,
        estNetVolume: estNet,
        cmf: cmfVal,
        mfi: mfiVal,
        volumeZScore: volZVal?.zScore ?? null,
        estimateMethod: estMethod,
      });
    }

    // Sort
    if (sort === "netEst") {
      stocks.sort((a, b) => (b.estNetVolume ?? 0) - (a.estNetVolume ?? 0));
    } else if (sort === "cmf") {
      stocks.sort((a, b) => (b.cmf ?? 0) - (a.cmf ?? 0));
    } else {
      stocks.sort((a, b) => b.totalTurnover - a.totalTurnover);
    }

    const label = fromDate === toDate ? fromDate : `${fromDate}–${toDate}`;
    return Response.json({ date: label, from: fromDate, to: toDate, stocks, source: "floorsheet" });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed" }, { status: 502 });
  }
}
