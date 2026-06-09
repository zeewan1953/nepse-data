import { getNepse, cached, getPriceHistory, getDailyTradeStats } from "@/lib/nepse";
import { generateSignal, type Candle } from "@/lib/signals";
import { breakout } from "@/tactical-analysis/calculation/breakout";
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

// Scans the most active stocks (top turnover + top volume + gainers), runs the
// deep technical signal on each, and returns them ranked by confidence so the
// dashboard can show "Top AI Buy Signals".
export async function GET() {
  try {
    const nepse = getNepse();
    const data = await cached("signals", 5 * 60_000, async () => {
      const [live, stats, turnover, volume, gainers, flows] = await Promise.all([
        nepse.getLiveMarket() as Promise<LiveMarketData[]>,
        getDailyTradeStats().catch(() => []),
        nepse.getTopTenTurnoverScrips(),
        nepse.getTopTenTradeScrips(),
        nepse.getTopTenGainers(),
        brokerFlowMap(),
      ]);

      // LTP source = same as Market Watch: last session's daily stats, overridden
      // by live prices when the market is open (so signals never show a stale LTP).
      const ltpMap = new Map<string, { ltp: number; name: string; change: number }>();
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

      const symbols = Array.from(
        new Set([
          ...turnover.map((t) => t.symbol),
          ...volume.map((t) => t.symbol),
          ...gainers.map((g) => g.symbol),
        ]),
      ).slice(0, 24);

      const results = await pool(symbols, 6, async (symbol) => {
        try {
          const hist = await getPriceHistory(symbol, 300);
          const candles: Candle[] = [...(hist?.content ?? [])]
            .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
            .map((c) => ({
              high: c.highPrice,
              low: c.lowPrice,
              close: c.closePrice,
              volume: c.totalTradedQuantity,
            }));
          const info = ltpMap.get(symbol);
          const ltp = info?.ltp ?? candles.at(-1)?.close ?? 0;
          const signal = generateSignal(candles, ltp);
          const brk = breakout(candles, ltp);
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
            breakout: {
              signal: brk.signal,
              entry: brk.entry,
              sl: brk.sl,
              tp1: brk.tp1,
              confidence: brk.confidence,
            },
            broker: flow,
          };
        } catch {
          return null;
        }
      });

      return results
        .filter((x): x is NonNullable<typeof x> => !!x && x.recommendation !== "No Data")
        .sort((a, b) => b.confidence - a.confidence);
    });

    return Response.json({ signals: data, generatedAt: Date.now() });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to compute signals" },
      { status: 502 },
    );
  }
}
