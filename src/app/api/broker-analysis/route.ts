import { getNepse, cached, getPriceHistory, getDailyTradeStats, safeNepseCall } from "@/lib/nepse";
import type { FloorSheet, FloorSheetItem, LiveMarketData } from "@rumess/nepse-api";
import { db } from "@/lib/db";
import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURAJ_BASE = "https://nepseapi.surajrimal.dev";

// Fetch live market from MeroLagani (same as /api/live)
async function fetchMeroLive(): Promise<LiveMarketData[]> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length) return [];
  const rows: LiveMarketData[] = mero.stock.detail.map((s) => {
    const pc = calcMeroPercent(s);
    const prevClose = s.lp - s.c;
    return {
      securityId: 0,
      securityName: s.s,
      symbol: s.s,
      indexId: 0,
      openPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      totalTradeQuantity: s.q,
      totalTradeValue: s.lp * s.q,
      lastTradedPrice: s.lp,
      percentageChange: pc,
      lastUpdatedDateTime: mero.overall?.d ?? "",
      lastTradedVolume: s.q,
      previousClose: prevClose,
      averageTradedPrice: 0,
    };
  });
  return rows.length > 50 ? rows : [];
}

// Fetch from suraj API (https://nepseapi.surajrimal.dev)
async function fetchSuraj<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${SURAJ_BASE}${path}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000), // 8s timeout
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch (e) {
    console.log(`[broker-analysis] Suraj ${path} error:`, (e as Error)?.message);
    return null;
  }
}

// Fetch live market from suraj API
async function fetchSurajLive(): Promise<LiveMarketData[]> {
  const data = await fetchSuraj<LiveMarketData[]>("/LiveMarket");
  return data || [];
}

// Check DB for floorsheet data first
async function getDBFloorsheet(date: string): Promise<FloorSheetItem[]> {
  try {
    const r = await db.execute({
      sql: `SELECT stockSymbol, buyerMemberId, sellerMemberId,
            contractQuantity, contractAmount
            FROM floorsheet_trades
            WHERE tradeDate = ?
            ORDER BY tradeOrder ASC`,
      args: [date],
    });
    if (r.rows.length > 0) {
      console.log(`[broker-analysis] DB floorsheet: ${r.rows.length} items for ${date}`);
      return r.rows.map((row) => ({
        stockSymbol: String(row.stockSymbol),
        buyerMemberId: String(row.buyerMemberId),
        sellerMemberId: String(row.sellerMemberId),
        contractQuantity: Number(row.contractQuantity),
        contractAmount: Number(row.contractAmount),
      } as FloorSheetItem));
    }
  } catch (e) {
    console.log("[broker-analysis] DB floorsheet error:", (e as Error)?.message);
  }
  return [];
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Fetch floorsheet - tries DB first, then suraj API, then NEPSE direct
async function fetchFloorsheet(): Promise<FloorSheetItem[]> {
  const today = todayStr();

  // 1. Try DB first (fastest, most reliable)
  const dbData = await getDBFloorsheet(today);
  if (dbData.length > 0) return dbData;

  // 2. Try suraj API (faster than NEPSE direct)
  const surajData = await fetchSuraj<{ floorsheet?: FloorSheetItem[] }>("/Floorsheet");
  if (surajData?.floorsheet?.length) {
    console.log(`[broker-analysis] Suraj floorsheet: ${surajData.floorsheet.length} items`);
    return surajData.floorsheet;
  }

  // 3. NEPSE direct (same approach as /api/floorsheet/analysis)
  try {
    const nepse = getNepse();
    const PAGE = 500;
    const MAX = 20;
    
    const firstPage = await safeNepseCall(() => nepse.getFloorSheet({ page: 0, size: PAGE }), "FS page 0") as FloorSheet;
    const items: FloorSheetItem[] = [...(firstPage.floorsheets?.content || [])];
    const totalPages = firstPage.floorsheets?.totalPages || 1;
    
    const pages = Math.min(totalPages, MAX);
    const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
    
    // Fetch in batches of 6
    for (let i = 0; i < rest.length; i += 6) {
      const batch = rest.slice(i, i + 6);
      const results = await Promise.all(
        batch.map((p) => 
          safeNepseCall(() => nepse.getFloorSheet({ page: p, size: PAGE }), `FS p${p}`).then((r) => (r as FloorSheet)?.floorsheets?.content || []).catch(() => [])
        )
      );
      results.forEach((r) => { if (r.length) items.push(...r); });
    }
    
    if (items.length > 0) {
      console.log(`[broker-analysis] NEPSE floorsheet: ${items.length} items from ${pages} pages`);
      return items;
    }
  } catch (e) {
    console.log("[broker-analysis] NEPSE floorsheet error:", (e as Error)?.message);
  }

  console.log("[broker-analysis] No floorsheet data from any source");
  return [];
}

// Calculate aggressive buy/sell from floorsheet
function calcAggressiveTrades(items: FloorSheetItem[]) {
  const brokerStockBuy = new Map<string, Map<string, { qty: number; amt: number }>>();
  const brokerStockSell = new Map<string, Map<string, { qty: number; amt: number }>>();

  for (const t of items) {
    const buyer = t.buyerMemberId;
    const seller = t.sellerMemberId;
    const sym = t.stockSymbol;
    const qty = t.contractQuantity;
    const amt = t.contractAmount;

    // Buyer side
    if (!brokerStockBuy.has(buyer)) brokerStockBuy.set(buyer, new Map());
    const bm = brokerStockBuy.get(buyer)!;
    const be = bm.get(sym) || { qty: 0, amt: 0 };
    be.qty += qty; be.amt += amt;
    bm.set(sym, be);

    // Seller side
    if (!brokerStockSell.has(seller)) brokerStockSell.set(seller, new Map());
    const sm = brokerStockSell.get(seller)!;
    const se = sm.get(sym) || { qty: 0, amt: 0 };
    se.qty += qty; se.amt += amt;
    sm.set(sym, se);
  }

  // Find brokers who only bought (aggressive buy) - no selling in that stock
  const aggressiveBuy: Array<{ broker: string; stock: string; volume: number; percent: number }> = [];
  for (const [broker, stocks] of brokerStockBuy) {
    const sellStocks = brokerStockSell.get(broker);
    for (const [stock, data] of stocks) {
      const sold = sellStocks?.get(stock);
      if (!sold || sold.amt < data.amt * 0.1) {
        aggressiveBuy.push({ broker, stock, volume: data.amt / 10000000, percent: 0 });
      }
    }
  }
  aggressiveBuy.sort((a, b) => b.volume - a.volume);
  const maxBuy = aggressiveBuy[0]?.volume || 1;
  aggressiveBuy.forEach((b) => { b.percent = Math.round((b.volume / maxBuy) * 100); });

  // Find brokers who only sold (aggressive sell) - no buying in that stock
  const aggressiveSell: Array<{ broker: string; stock: string; volume: number; percent: number }> = [];
  for (const [broker, stocks] of brokerStockSell) {
    const buyStocks = brokerStockBuy.get(broker);
    for (const [stock, data] of stocks) {
      const bought = buyStocks?.get(stock);
      if (!bought || bought.amt < data.amt * 0.1) {
        aggressiveSell.push({ broker, stock, volume: data.amt / 10000000, percent: 0 });
      }
    }
  }
  aggressiveSell.sort((a, b) => b.volume - a.volume);
  const maxSell = aggressiveSell[0]?.volume || 1;
  aggressiveSell.forEach((b) => { b.percent = Math.round((b.volume / maxSell) * 100); });

  return { aggressiveBuy: aggressiveBuy.slice(0, 8), aggressiveSell: aggressiveSell.slice(0, 8) };
}

// Calculate broker favorites (most traded stocks by volume per broker)
function calcBrokerFavorites(items: FloorSheetItem[]) {
  // Track total VOLUME traded (buy + sell) per broker per stock
  const brokerStockVolume = new Map<string, Map<string, number>>();
  // Also track net position for context
  const brokerStockNet = new Map<string, Map<string, number>>();

  for (const t of items) {
    const buyer = t.buyerMemberId;
    const seller = t.sellerMemberId;
    const sym = t.stockSymbol;
    const qty = t.contractQuantity;

    // Volume: add to both buyer and seller
    if (!brokerStockVolume.has(buyer)) brokerStockVolume.set(buyer, new Map());
    const bvm = brokerStockVolume.get(buyer)!;
    bvm.set(sym, (bvm.get(sym) || 0) + qty);

    if (!brokerStockVolume.has(seller)) brokerStockVolume.set(seller, new Map());
    const svm = brokerStockVolume.get(seller)!;
    svm.set(sym, (svm.get(sym) || 0) + qty);

    // Net position: buyer +qty, seller -qty
    if (!brokerStockNet.has(buyer)) brokerStockNet.set(buyer, new Map());
    const bnm = brokerStockNet.get(buyer)!;
    bnm.set(sym, (bnm.get(sym) || 0) + qty);

    if (!brokerStockNet.has(seller)) brokerStockNet.set(seller, new Map());
    const snm = brokerStockNet.get(seller)!;
    snm.set(sym, (snm.get(sym) || 0) - qty);
  }

  // Get top 8 brokers by total VOLUME (most active traders)
  const brokerTotalVolume = new Map<string, number>();
  for (const [broker, stocks] of brokerStockVolume) {
    let total = 0;
    for (const [, vol] of stocks) total += vol;
    brokerTotalVolume.set(broker, total);
  }

  const topBrokers = [...brokerTotalVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([broker]) => {
      const volumes = brokerStockVolume.get(broker)!;
      const nets = brokerStockNet.get(broker)!;
      // Top 3 stocks by volume traded
      const favorites = [...volumes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sym]) => sym);
      return { broker, favorites };
    });

  return topBrokers;
}

// Calculate zero-sum (broker vs broker net positions)
function calcZeroSum(items: FloorSheetItem[]) {
  const stockBrokerNet = new Map<string, Map<string, number>>();

  for (const t of items) {
    const sym = t.stockSymbol;
    const buyer = t.buyerMemberId;
    const seller = t.sellerMemberId;
    const amt = t.contractAmount;

    if (!stockBrokerNet.has(sym)) stockBrokerNet.set(sym, new Map());
    const bm = stockBrokerNet.get(sym)!;
    bm.set(buyer, (bm.get(buyer) || 0) + amt);
    bm.set(seller, (bm.get(seller) || 0) - amt);
  }

  // Find stocks with opposing broker positions
  const zeroSumItems: Array<{ stock: string; buyer: string; seller: string; net: string }> = [];
  for (const [stock, brokers] of stockBrokerNet) {
    const entries = [...brokers.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length >= 2) {
      const topBuyer = entries[0];
      const topSeller = entries[entries.length - 1];
      if (topBuyer[1] > 0 && topSeller[1] < 0) {
        const net = topBuyer[1] + topSeller[1];
        zeroSumItems.push({
          stock,
          buyer: topBuyer[0],
          seller: topSeller[0],
          net: (net >= 0 ? "+" : "") + (net / 10000000).toFixed(1) + " Cr",
        });
      }
    }
  }
  return zeroSumItems.slice(0, 8);
}

// Simple RSI calculation
function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate AI signals from live data + price history
async function calcAISignals(liveData: LiveMarketData[]) {
  const topStocks = liveData
    .filter((s) => s.totalTradeQuantity > 1000)
    .sort((a, b) => b.totalTradeValue - a.totalTradeValue)
    .slice(0, 8);

  const signals: Array<{ type: string; stock: string; reason: string; confidence: number; level: string }> = [];

  for (const stock of topStocks) {
    try {
      const history = await getPriceHistory(stock.symbol, 60);
      const prices = (history.content || []).map((c) => c.closePrice);
      if (prices.length < 20) continue;

      const rsi = calcRSI(prices);
      const recentVol = stock.totalTradeQuantity;
      const avgVol = (history.content || []).slice(-20).reduce((s, c) => s + c.totalTradedQuantity, 0) / 20;
      const volumeRatio = avgVol > 0 ? recentVol / avgVol : 1;

      let type = "NEUTRAL", reason = "Low Volume", confidence = 45, level = "low";

      if (rsi < 30 && volumeRatio > 1.2) {
        type = "BUY"; reason = "Accumulation"; confidence = Math.min(95, Math.round(70 + (30 - rsi))); level = "high";
      } else if (rsi < 40 && stock.percentageChange > 0) {
        type = "BUY"; reason = "Oversold bounce"; confidence = Math.min(85, Math.round(60 + (40 - rsi))); level = "medium";
      } else if (rsi > 70 && volumeRatio > 1.2) {
        type = "SELL"; reason = "Distribution"; confidence = Math.min(95, Math.round(70 + (rsi - 70))); level = "high";
      } else if (rsi > 60 && stock.percentageChange < -1) {
        type = "SELL"; reason = "Overbought reversal"; confidence = Math.min(85, Math.round(60 + (rsi - 60))); level = "medium";
      } else if (rsi >= 40 && rsi <= 60) {
        type = "HOLD"; reason = "Sideways"; confidence = Math.round(50 + Math.abs(50 - rsi)); level = "medium";
      }

      signals.push({ type, stock: stock.symbol, reason, confidence, level });
    } catch {
      // Skip stocks where history fails
    }
  }

  return signals.slice(0, 4);
}

export async function GET() {
  try {
    // Overall timeout: 30 seconds max
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("API timeout after 30s")), 30000)
    );

    const data = await Promise.race([
      cached("broker-analysis-full", 10_000, async () => {
        // Fetch all data in parallel from multiple sources
        const [floorsheet, meroLive, surajLive, nepseLive, dailyStats] = await Promise.all([
          fetchFloorsheet(),
          fetchMeroLive(),
          fetchSurajLive(),
          safeNepseCall(() => getNepse().getLiveMarket(), "Live").catch(() => [] as LiveMarketData[]),
          getDailyTradeStats().catch(() => []),
        ]);

      // Use best live data source: merolagani > suraj > nepse > daily stats
      let live: LiveMarketData[] = [];
      let source = "none";

      if (meroLive.length > 50) {
        live = meroLive;
        source = "merolagani";
      } else if (surajLive.length > 50) {
        live = surajLive;
        source = "suraj";
      } else if (Array.isArray(nepseLive) && nepseLive.length > 50) {
        live = nepseLive as LiveMarketData[];
        source = "nepse";
      } else if (dailyStats.length > 0) {
        live = (dailyStats as Array<{ symbol: string; lastTradedPrice: number; percentageChange: number; totalTradeQuantity: number; totalTradeValue: number }>).map((s) => ({
          securityId: 0,
          securityName: s.symbol,
          symbol: s.symbol,
          indexId: 0,
          openPrice: s.lastTradedPrice,
          highPrice: s.lastTradedPrice,
          lowPrice: s.lastTradedPrice,
          previousClose: s.lastTradedPrice * (1 - (s.percentageChange || 0) / 100),
          totalTradeQuantity: s.totalTradeQuantity || 0,
          totalTradeValue: s.totalTradeValue || 0,
          lastTradedPrice: s.lastTradedPrice || 0,
          percentageChange: s.percentageChange || 0,
          lastUpdatedDateTime: "",
          lastTradedVolume: 0,
          averageTradedPrice: 0,
        })) as LiveMarketData[];
        source = "stats";
      }

      // Calculate all derived data from floorsheet OR use sample data if floorsheet unavailable
      let aggressiveBuy: Array<{ broker: string; stock: string; volume: number; percent: number }> = [];
      let aggressiveSell: Array<{ broker: string; stock: string; volume: number; percent: number }> = [];
      let brokerFavorites: Array<{ broker: string; favorites: string[] }> = [];
      let zeroSum: Array<{ stock: string; buyer: string; seller: string; net: string }> = [];
      let totalTrades = floorsheet.length;
      let totalQty = floorsheet.reduce((s, t) => s + t.contractQuantity, 0);
      let totalAmt = floorsheet.reduce((s, t) => s + t.contractAmount, 0);
      const uniqueBrokers = new Set([...floorsheet.map((t) => t.buyerMemberId), ...floorsheet.map((t) => t.sellerMemberId)]);
      const uniqueStocks = new Set(floorsheet.map((t) => t.stockSymbol));
      let isSampleData = false;

      if (floorsheet.length > 0) {
        const result = calcAggressiveTrades(floorsheet);
        aggressiveBuy = result.aggressiveBuy;
        aggressiveSell = result.aggressiveSell;
        brokerFavorites = calcBrokerFavorites(floorsheet);
        zeroSum = calcZeroSum(floorsheet);
      }

      const dataAvailable = floorsheet.length > 0 || live.length > 0;

      return {
        generatedAt: Date.now(),
        source,
        dataAvailable,
        totals: {
          trades: totalTrades,
          qty: totalQty,
          amount: totalAmt,
          brokers: uniqueBrokers.size,
          stocks: uniqueStocks.size,
        },
        aggressiveBuy,
        aggressiveSell,
        brokerFavorites,
        zeroSum,
        aiSignals,
        liveCount: live.length,
        floorCount: floorsheet.length,
        liveData: live.length > 0 ? {
          advances: live.filter((r) => r.percentageChange > 0).length,
          declines: live.filter((r) => r.percentageChange < 0).length,
          unchanged: live.filter((r) => r.percentageChange === 0).length,
        } : null,
        error: !dataAvailable ? "No data available. NEPSE API may be unreachable and DB has no synced data. Please sync floorsheet data first." : floorsheet.length === 0 ? "Floorsheet data unavailable. Run /api/floorsheet/sync to populate." : undefined,
      };
      }),
      timeoutPromise,
    ]);

    return Response.json(data);
  } catch (e) {
    // Return empty data on timeout/error instead of failing
    console.error("[broker-analysis] Error:", (e as Error)?.message);
    return Response.json({
      generatedAt: Date.now(),
      source: "fallback",
      totals: { trades: 0, qty: 0, amount: 0, brokers: 0, stocks: 0 },
      aggressiveBuy: [],
      aggressiveSell: [],
      brokerFavorites: [],
      zeroSum: [],
      aiSignals: [],
      liveCount: 0,
      floorCount: 0,
      error: "API timeout or error. NEPSE API may be unreachable.",
    });
  }
}
