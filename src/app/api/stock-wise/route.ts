import "server-only";
import { execute } from "@/lib/db";
import { getNepse } from "@/lib/nepse";
import { computeCMF, computeMFI, computeVolumeZScore } from "@/lib/broker_flow_analytics";
import type { NextRequest } from "next/server";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const CACHE_TTL = 60_000;

let liveCache: { data: FloorSheetItem[]; ts: number } | null = null;

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

async function fetchLiveTrades(): Promise<FloorSheetItem[] | null> {
  if (liveCache && Date.now() - liveCache.ts < CACHE_TTL) return liveCache.data;

  try {
    const first = await getNepse().getFloorSheet({ page: 0, size: PAGE_SIZE }) as FloorSheet;
    const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
    const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
    const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
    for (let i = 0; i < rest.length; i += 6) {
      const batch = rest.slice(i, i + 6);
      const res = await Promise.all(
        batch.map((p) =>
          getNepse().getFloorSheet({ page: p, size: PAGE_SIZE })
            .then((r) => (r as FloorSheet).floorsheets?.content ?? [])
            .catch(() => []),
        ),
      );
      res.forEach((r) => items.push(...r));
    }
    const result = items.length > 0 ? items : null;
    liveCache = result ? { data: result, ts: Date.now() } : liveCache;
    return result;
  } catch {
    return liveCache?.data ?? null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const sort = sp.get("sort") || "turnover";
    const live = sp.get("live") === "true";

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

    // Live mode: fetch directly from NEPSE API
    if (live) {
      const liveItems = await fetchLiveTrades();
      if (liveItems && liveItems.length > 0) {
        const stocksMap = new Map<string, Array<{ tradeOrder: number; price: number; quantity: number }>>();
        for (let i = 0; i < liveItems.length; i++) {
          const t = liveItems[i];
          const sym = t.stockSymbol;
          if (!stocksMap.has(sym)) stocksMap.set(sym, []);
          stocksMap.get(sym)!.push({
            tradeOrder: i,
            price: t.contractAmount / Math.max(1, t.contractQuantity),
            quantity: t.contractQuantity,
          });
        }
        // Get symbols for OHLCV lookup
        const symbols = [...stocksMap.keys()];
        const ohlcvRows = await execute(
          `SELECT symbol, tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv 
           WHERE symbol IN (${symbols.map(() => "?").join(",")}) 
           ORDER BY symbol, tradeDate DESC`,
          symbols,
        );
        const ohlcvMap = new Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>();
        for (const r of ohlcvRows.rows) {
          const sym = String(r.symbol);
          if (!ohlcvMap.has(sym)) ohlcvMap.set(sym, []);
          ohlcvMap.get(sym)!.push({
            date: String(r.tradeDate), open: Number(r.open), high: Number(r.high),
            low: Number(r.low), close: Number(r.close), volume: Number(r.volume),
          });
        }
        const minTradesForEstimate = 5;
        const stocks: Array<any> = [];
        for (const [symbol, trades] of stocksMap) {
          const totalVol = trades.reduce((a, t) => a + t.quantity, 0);
          const totalTurn = trades.reduce((a, t) => a + t.price * t.quantity, 0);
          const tc = trades.length;
          const avgP = totalVol > 0 ? totalTurn / totalVol : null;
          let estBuy: number | null = null, estSell: number | null = null, estNet: number | null = null, estMethod: string | null = null;
          if (tc >= minTradesForEstimate) {
            const classified = classifyTrades(trades);
            let buyVol = 0, sellVol = 0;
            for (const c of classified) {
              if (c.direction === "buy") buyVol += c.quantity;
              else if (c.direction === "sell") sellVol += c.quantity;
            }
            estBuy = buyVol; estSell = sellVol; estNet = buyVol - sellVol; estMethod = "tick-rule";
          }
          const ohlcv = ohlcvMap.get(symbol) || [];
          const ohlcvAsc = [...ohlcv].reverse();
          const bars = ohlcvAsc.map(o => ({ date: o.date, open: o.open, high: o.high, low: o.low, close: o.close, volume: o.volume }));
          const cmfVal = computeCMF(bars, 7);
          const mfiVal = computeMFI(bars, 5);
          const volZVal = computeVolumeZScore(bars, 7);
          const ohlcvSorted = [...ohlcv].sort((a, b) => b.date.localeCompare(a.date));
          const ltp = ohlcvSorted.length > 0 ? ohlcvSorted[0].close : avgP;
          const changePercent = ohlcvSorted.length > 1 ? ((ohlcvSorted[0].close - ohlcvSorted[1].close) / ohlcvSorted[1].close) * 100 : null;
          stocks.push({
            symbol, ltp: ltp ? Math.round(ltp * 100) / 100 : null,
            changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
            totalVolume: totalVol, totalTurnover: totalTurn, tradeCount: tc, avgPrice: avgP,
            estBuyVolume: estBuy, estSellVolume: estSell, estNetVolume: estNet,
            cmf: cmfVal, mfi: mfiVal, volumeZScore: volZVal?.zScore ?? null, estimateMethod: estMethod,
          });
        }
        if (sort === "netEst") stocks.sort((a, b) => (b.estNetVolume ?? 0) - (a.estNetVolume ?? 0));
        else if (sort === "cmf") stocks.sort((a, b) => (b.cmf ?? 0) - (a.cmf ?? 0));
        else stocks.sort((a, b) => b.totalTurnover - a.totalTurnover);
        return Response.json({ date: today, stocks, source: "live", estimateMethod: "tick-rule" });
      }
    }

    // DB fallback
    let fromDate: string;
    let toDate: string;
    if (fromParam && toParam) {
      fromDate = fromParam;
      toDate = toParam;
    } else if (dateParam) {
      fromDate = dateParam;
      toDate = dateParam;
    } else {
      const latest = await execute("SELECT MAX(tradeDate) AS d FROM floorsheet_trades");
      const latestDate = (latest.rows[0] as any)?.d ? String((latest.rows[0] as any).d) : today;
      fromDate = latestDate;
      toDate = latestDate;
    }

    const allRows = await execute(
      "SELECT stockSymbol, tradeOrder, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate >= ? AND tradeDate <= ? ORDER BY stockSymbol, tradeOrder ASC",
      [fromDate, toDate],
    );

    if (!allRows.rows.length) {
      const label = fromDate === toDate ? fromDate : `${fromDate}–${toDate}`;
      const dateRows = await execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate DESC LIMIT 5");
      const availableDates = dateRows.rows.map((r: any) => String(r.tradeDate));
      return Response.json({ date: label, from: fromDate, to: toDate, stocks: [], source: "floorsheet", availableDates });
    }

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
      const cmfVal = computeCMF(bars, 7);
      const mfiVal = computeMFI(bars, 5);
      const volZVal = computeVolumeZScore(bars, 7);

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
