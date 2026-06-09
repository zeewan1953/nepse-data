import { getNepse, cached, getDailyTradeStats } from "@/lib/nepse";
import { saveLiveSnapshot, getOhlcMap } from "@/lib/db";
import type { LiveMarketData, Security } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the last good live snapshot in memory so the market watch keeps showing
// every stock (with its last prices) even after the market closes and the live
// feed empties out.
declare global {
  // eslint-disable-next-line no-var
  var __lastLive: LiveMarketData[] | undefined;
}

type Ohlc = { openPrice: number; highPrice: number; lowPrice: number; averageTradedPrice: number };

// Always returns EVERY listed company:
//  - market open: live prices for all (and cached as the last snapshot)
//  - market closed: the full security list merged with last-session daily stats
//    (price / % change / volume) and the last captured O/H/L. Untraded stocks
//    still appear, with zeros.
async function loadAll(): Promise<{ rows: LiveMarketData[]; source: string }> {
  const nepse = getNepse();
  const live = await nepse.getLiveMarket().catch(() => [] as LiveMarketData[]);
  if (Array.isArray(live) && live.length > 50) {
    globalThis.__lastLive = live;
    try {
      saveLiveSnapshot(live);
    } catch {
      /* db optional */
    }
    return { rows: live, source: "live" };
  }

  const [securities, stats] = await Promise.all([
    cached("seclist", 3_600_000, () => nepse.getSecurityList()).catch(() => []),
    getDailyTradeStats().catch(() => []),
  ]);
  const statMap = new Map(stats.map((s) => [s.symbol, s]));
  let ohlc = new Map<string, Ohlc>();
  try {
    ohlc = getOhlcMap();
  } catch {
    /* db optional */
  }

  const active = (securities ?? []).filter((s: Security) => s.activeStatus === "A");
  if (active.length) {
    const rows = active
      .map((s: Security) => {
        const st = statMap.get(s.symbol);
        const o = ohlc.get(s.symbol);
        const ltp = st?.lastTradedPrice ?? st?.closePrice ?? 0;
        return {
          securityId: s.id,
          securityName: s.securityName ?? s.name,
          symbol: s.symbol,
          indexId: 0,
          openPrice: o?.openPrice ?? 0,
          highPrice: o?.highPrice ?? 0,
          lowPrice: o?.lowPrice ?? 0,
          totalTradeQuantity: st?.totalTradeQuantity ?? 0,
          totalTradeValue: (st?.totalTradeQuantity ?? 0) * (st?.closePrice ?? ltp),
          lastTradedPrice: ltp,
          percentageChange: st?.percentageChange ?? 0,
          lastUpdatedDateTime: "",
          lastTradedVolume: 0,
          previousClose: st?.previousClose ?? 0,
          averageTradedPrice: o?.averageTradedPrice ?? 0,
        };
      })
      .sort((a, b) => b.percentageChange - a.percentageChange) satisfies LiveMarketData[];
    return { rows, source: stats.length ? "list+stats" : "list" };
  }

  if (globalThis.__lastLive?.length) {
    return { rows: globalThis.__lastLive, source: "snapshot" };
  }
  return { rows: [], source: "empty" };
}

export async function GET() {
  try {
    const { rows, source } = await cached("live", 4_000, loadAll);
    return Response.json({ data: rows, count: rows.length, source });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load live market" },
      { status: 502 },
    );
  }
}
