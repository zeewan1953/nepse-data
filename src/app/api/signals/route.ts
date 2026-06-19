import { getNepse, cached, getPriceHistory, getDailyTradeStats } from "@/lib/nepse";
import { generateSignal, type Candle } from "@/lib/signals";
import { breakout } from "@/tactical-analysis/calculation/breakout";
import { fetchMeroLaganiSummary, calcMeroGainers, calcMeroLosers, calcMeroPercent } from "@/lib/merolagani";
import { getCandlesFromDb, getBrokerFlowFromDb, getAllStocks } from "@/lib/db";
import { classifySymbol } from "@/lib/types";
import { generateSyntheticCandles } from "@/lib/syntheticCandles";
import { generateInstitutionalSignal } from "@/lib/institutionalSignal";
import { generateInstitutionalBreakout } from "@/lib/institutionalBreakout";
import type { LiveMarketData, FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Run small async batches so we don't fire hundreds of requests at NEPSE at once.
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

type BrokerFlow = { buyerId: string; buyerNet: number; sellerId: string; sellerNet: number; bias: "accumulate" | "distribute" | "neutral" } | null;

// Per-stock broker net quantity from a floorsheet sample → who is accumulating.
async function brokerFlowMap(): Promise<Map<string, BrokerFlow>> {
  const nepse = getNepse();
  const SIZE = 500;
  const PAGES = 6;
  const items: FloorSheetItem[] = [];
  try {
    const first = (await nepse.getFloorSheet({ page: 0, size: SIZE })) as FloorSheet;
    items.push(...(first.floorsheets?.content ?? []));
    const pages = Math.min(first.floorsheets?.totalPages ?? 1, PAGES);
    const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
    const res = await Promise.all(rest.map((p) => nepse.getFloorSheet({ page: p, size: SIZE }).catch(() => null)));
    for (const r of res) if (r) items.push(...((r as FloorSheet).floorsheets?.content ?? []));
  } catch {
    return new Map();
  }
  const byStock = new Map<string, Map<string, number>>();
  for (const t of items) {
    const m = byStock.get(t.stockSymbol) ?? new Map<string, number>();
    m.set(t.buyerMemberId, (m.get(t.buyerMemberId) ?? 0) + t.contractQuantity);
    m.set(t.sellerMemberId, (m.get(t.sellerMemberId) ?? 0) - t.contractQuantity);
    byStock.set(t.stockSymbol, m);
  }
  const out = new Map<string, BrokerFlow>();
  for (const [symbol, m] of byStock) {
    let buyerId = "", buyerNet = -Infinity, sellerId = "", sellerNet = Infinity;
    for (const [id, net] of m) {
      if (net > buyerNet) { buyerNet = net; buyerId = id; }
      if (net < sellerNet) { sellerNet = net; sellerId = id; }
    }
    const bias = buyerNet > -sellerNet * 1.2 ? "accumulate" : -sellerNet > buyerNet * 1.2 ? "distribute" : "neutral";
    out.set(symbol, { buyerId, buyerNet: Math.round(buyerNet), sellerId, sellerNet: Math.round(sellerNet), bias });
  }
  return out;
}

type StockInfo = { ltp: number; name: string; change: number };
type TurnoverOhlc = { open: number; high: number; low: number; close: number; volume: number };

// Build stock info from MeroLagani (primary source)
async function getStockInfoFromMero(): Promise<{
  ltpMap: Map<string, StockInfo>;
  topSymbols: string[];
  turnoverOhlc: Map<string, TurnoverOhlc>;
} | null> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length || mero.stock.detail.length < 50) return null;

  const stocks = mero.stock.detail;
  const ltpMap = new Map<string, StockInfo>();
  const turnoverOhlc = new Map<string, TurnoverOhlc>();

  for (const s of stocks) {
    ltpMap.set(s.s, {
      ltp: s.lp,
      name: s.s,
      change: calcMeroPercent(s),
    });
  }

  // Collect turnover OHLC data
  for (const t of mero.turnover?.detail ?? []) {
    if (t.op > 0 && t.lp > 0) {
      turnoverOhlc.set(t.s, {
        open: t.op, high: t.h, low: t.l, close: t.lp, volume: t.q,
      });
    }
  }

  // Get top symbols: top gainers + top losers + top volume
  const gainers = calcMeroGainers(stocks, 15).map((s) => s.s);
  const losers = calcMeroLosers(stocks, 15).map((s) => s.s);
  const topVolume = [...stocks].sort((a, b) => b.q - a.q).slice(0, 15).map((s) => s.s);
  const topTurnover = (mero.turnover?.detail ?? []).slice(0, 15).map((s) => s.s);

  const topSymbols = Array.from(new Set([...gainers, ...losers, ...topVolume, ...topTurnover])).slice(0, 24);

  return { ltpMap, topSymbols, turnoverOhlc };
}

// Build stock info from DB stocks as fallback
async function getStockInfoFromDb(): Promise<{
  ltpMap: Map<string, StockInfo>;
  topSymbols: string[];
}> {
  const stocks = await getAllStocks().catch(() => []);
  const ltpMap = new Map<string, StockInfo>();

  for (const s of stocks) {
    ltpMap.set(s.symbol, {
      ltp: s.lastTradedPrice,
      name: s.name,
      change: s.percentageChange,
    });
  }

  // Sort by change for gainers/losers, by quantity for volume
  const sorted = [...stocks].filter((s) => s.lastTradedPrice > 0);
  const gainers = [...sorted].sort((a, b) => b.percentageChange - a.percentageChange).slice(0, 15).map((s) => s.symbol);
  const losers = [...sorted].sort((a, b) => a.percentageChange - b.percentageChange).slice(0, 15).map((s) => s.symbol);
  const topVolume = [...sorted].sort((a, b) => b.totalTradeQuantity - a.totalTradeQuantity).slice(0, 15).map((s) => s.symbol);
  const topSymbols = Array.from(new Set([...gainers, ...losers, ...topVolume])).slice(0, 24);

  return { ltpMap, topSymbols };
}

// Scans the most active stocks (top turnover + top volume + gainers), runs the
// deep technical signal on each, and returns them ranked by confidence so the
// dashboard can show "Top AI Buy Signals".
export async function GET() {
  try {
    const data = await cached("signals", 5 * 60_000, async () => {
      // 1. Get stock info from MeroLagani (primary) or DB (fallback)
      let ltpMap: Map<string, StockInfo>;
      let symbols: string[];
      let source: string;
      let turnoverOhlc = new Map<string, TurnoverOhlc>();

      const meroInfo = await getStockInfoFromMero();
      if (meroInfo) {
        ltpMap = meroInfo.ltpMap;
        symbols = meroInfo.topSymbols;
        source = "merolagani";
        turnoverOhlc = meroInfo.turnoverOhlc;
      } else {
        // Try NEPSE direct
        try {
          const nepse = getNepse();
          const [live, stats, turnover, volume, gainers] = await Promise.all([
            nepse.getLiveMarket() as Promise<LiveMarketData[]>,
            getDailyTradeStats().catch(() => []),
            nepse.getTopTenTurnoverScrips(),
            nepse.getTopTenTradeScrips(),
            nepse.getTopTenGainers(),
          ]);

          ltpMap = new Map<string, StockInfo>();
          for (const s of stats) {
            ltpMap.set(s.symbol, {
              ltp: s.lastTradedPrice ?? s.closePrice,
              name: s.securityName,
              change: s.percentageChange,
            });
          }
          for (const r of live) {
            ltpMap.set(r.symbol, {
              ltp: r.lastTradedPrice,
              name: r.securityName,
              change: r.percentageChange,
            });
          }
          symbols = Array.from(
            new Set([
              ...turnover.map((t) => t.symbol),
              ...volume.map((t) => t.symbol),
              ...gainers.map((g) => g.symbol),
            ]),
          ).slice(0, 24);
          source = "nepse";
        } catch {
          // NEPSE failed, use DB
          const dbInfo = await getStockInfoFromDb();
          ltpMap = dbInfo.ltpMap;
          symbols = dbInfo.topSymbols;
          source = "database";
        }
      }

      // 2. Get broker flow from DB first (fast), then NEPSE floorsheet
      let flows: Map<string, BrokerFlow> = await getBrokerFlowFromDb().catch(() => new Map());
      if (flows.size === 0) {
        flows = await brokerFlowMap().catch(() => new Map());
      }

      // 3. Get candles from DB first (fast), then NEPSE API, then synthetic
      const results = await pool(symbols, 6, async (symbol) => {
        try {
          // Try DB candles first
          let candles: Candle[] = [];
          const dbCandles = await getCandlesFromDb(symbol, 300).catch(() => []);
          if (dbCandles.length >= 20) {
            candles = dbCandles.map((c) => ({
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }));
          } else {
            // Fallback to NEPSE API for price history
            try {
              const hist = await getPriceHistory(symbol, 300);
              candles = [...(hist?.content ?? [])]
                .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
                .map((c) => ({
                  high: c.highPrice,
                  low: c.lowPrice,
                  close: c.closePrice,
                  volume: c.totalTradedQuantity,
                }));
            } catch {
              // NEPSE failed, try synthetic candles from turnover data
              const info = ltpMap.get(symbol);
              const ohlc = turnoverOhlc.get(symbol);
              if (info && ohlc) {
                // Calculate previousClose from LTP and % change
                const prevClose = info.change !== 0
                  ? ohlc.close / (1 + info.change / 100)
                  : ohlc.close * 0.99; // default 1% change
                candles = generateSyntheticCandles(
                  prevClose, ohlc.open, ohlc.high, ohlc.low, ohlc.close, ohlc.volume
                );
              } else if (info && info.ltp > 0) {
                // No turnover OHLC, estimate from LTP
                const prevClose = info.change !== 0
                  ? info.ltp / (1 + info.change / 100)
                  : info.ltp * 0.99;
                const range = info.ltp * 0.02; // estimate 2% daily range
                candles = generateSyntheticCandles(
                  prevClose,
                  prevClose + (info.ltp - prevClose) * 0.3, // estimated open
                  Math.max(info.ltp, prevClose) + range * 0.3, // estimated high
                  Math.min(info.ltp, prevClose) - range * 0.3, // estimated low
                  info.ltp, // close = LTP
                  100000 // estimated volume
                );
              }
            }
          }

          if (candles.length < 5) return null; // Not enough data for signals

          const info = ltpMap.get(symbol);
          const ltp = info?.ltp ?? candles.at(-1)?.close ?? 0;
          const signal = generateSignal(candles, ltp);
          const brk = breakout(candles, ltp);
          const inst = generateInstitutionalSignal(symbol, candles, ltp);
          const instBrk = generateInstitutionalBreakout(symbol, candles, ltp);
          const flow = flows.get(symbol) ?? null;
          // nudge confidence by broker bias (accumulation = bullish, distribution = bearish)
          let confidence = signal.confidence;
          if (flow?.bias === "accumulate") confidence = Math.min(98, confidence + 6);
          else if (flow?.bias === "distribute") confidence = Math.max(2, confidence - 6);
          return {
            symbol,
            name: info?.name ?? "",
            ltp,
            change: info?.change ?? 0,
            recommendation: signal.recommendation,
            confidence,
            buyZone: signal.buyZone,
            target1: signal.target1,
            stopLoss: signal.stopLoss,
            trend: signal.trend,
            rsi: signal.rsi,
            atr: signal.atr,
            atrStopLoss: signal.atrStopLoss,
            sar: signal.sar,
            tmaSignal: signal.tmaDmaCross,
            tmaValue: signal.tmaValue,
            sma50: signal.sma50,
            sma200: signal.sma200,
            ema20: signal.ema20,
            macd: signal.macd,
            breakout: {
              signal: brk.signal,
              entry: brk.entry,
              sl: brk.sl,
              tp1: brk.tp1,
              confidence: brk.confidence,
            },
            instBreakout: {
              structure: instBrk.marketStructure,
              direction: instBrk.direction,
              breakoutType: instBrk.breakoutType,
              entryZone: instBrk.entryZone,
              breakoutLevel: instBrk.breakoutLevel,
              stopLoss: instBrk.stopLoss,
              tp1: instBrk.tp1,
              tp2: instBrk.tp2,
              tp3: instBrk.tp3,
              rr: instBrk.riskReward,
              score: instBrk.confidenceScore,
              scores: {
                compression: instBrk.structureCompression,
                liquidity: instBrk.liquiditySweep,
                volume: instBrk.volumeExpansion,
                momentum: instBrk.momentumAlignment,
                htf: instBrk.htfTrendAlignment,
                rrQuality: instBrk.riskRewardQuality,
              },
              hasSweep: instBrk.hasLiquiditySweep,
              hasTrap: instBrk.hasFalseBreakoutTrap,
              isWick: instBrk.wickBreakout,
              reason: instBrk.validationReason,
              status: instBrk.tradeStatus,
            },
            institutional: {
              regime: inst.marketRegime,
              direction: inst.direction,
              entryType: inst.entryType,
              entryZone: inst.entryZone,
              stopLoss: inst.stopLoss,
              tp1: inst.tp1,
              tp2: inst.tp2,
              tp3: inst.tp3,
              rr: inst.riskReward,
              score: inst.confidenceScore,
              structureEvent: inst.structureEvent,
              scores: inst.scores,
              reasoning: inst.reasoning,
              tradeValid: inst.tradeValid,
              invalidReason: inst.invalidReason,
            },
            broker: flow,
          };
        } catch {
          return null;
        }
      });

      return {
        signals: results
          .filter((x): x is NonNullable<typeof x> => {
            if (!x || x.recommendation === "No Data") return false;
            // Exclude Debentures/Bonds and Mutual Funds
            const st = classifySymbol(x.symbol, x.name);
            return st !== "DB" && st !== "MF";
          })
          .sort((a, b) => b.confidence - a.confidence),
        source,
      };
    });

    return Response.json({ signals: data.signals, generatedAt: Date.now(), source: data.source });
  } catch (e) {
    // Return empty signals instead of 502 so dashboard doesn't show error
    return Response.json({ signals: [], generatedAt: Date.now(), source: "fallback", error: (e as Error)?.message });
  }
}
