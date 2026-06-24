import { getNepse, cached, getDailyTradeStats, safeNepseCall } from "@/lib/nepse";
import { saveLiveSnapshot, getOhlcMap, getAllStocks, syncMeroOhlcv, saveStocks } from "@/lib/db";
import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import type { LiveMarketData, Security } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __lastLive: LiveMarketData[] | undefined;
}

type Ohlc = { openPrice: number; highPrice: number; lowPrice: number; averageTradedPrice: number };

// Fetch from MeroLagani as PRIMARY source (real NEPSE data)
async function fetchFromMeroLagani(): Promise<{ rows: LiveMarketData[]; source: string; raw: import("@/lib/merolagani").MeroMarketSummary | null } | null> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length) return null;

  // Fetch OHLC map from DB to enrich with open/high/low
  let ohlc = new Map<string, Ohlc>();
  try { ohlc = await getOhlcMap(); } catch { /* ohlc optional */ }

  const rows: LiveMarketData[] = mero.stock.detail.map((s) => {
    const pc = calcMeroPercent(s);
    const prevClose = s.lp - s.c;
    const o = ohlc.get(s.s);
    return {
      securityId: 0,
      securityName: s.s,
      symbol: s.s,
      indexId: 0,
      openPrice: o?.openPrice ?? 0,
      highPrice: o?.highPrice ?? 0,
      lowPrice: o?.lowPrice ?? 0,
      totalTradeQuantity: s.q,
      totalTradeValue: s.lp * s.q,
      lastTradedPrice: s.lp,
      percentageChange: pc,
      lastUpdatedDateTime: mero.overall?.d ?? "",
      lastTradedVolume: s.q,
      previousClose: prevClose,
      averageTradedPrice: o?.averageTradedPrice ?? 0,
    };
  });

  if (rows.length > 50) {
    return { rows, source: "merolagani", raw: mero };
  }
  return null;
}

async function loadAll(): Promise<{ rows: LiveMarketData[]; source: string }> {
  // 1. Try MeroLagani first (real NEPSE data via JSON API)
  const meroData = await fetchFromMeroLagani();
  if (meroData) {
    globalThis.__lastLive = meroData.rows;
    try { await saveLiveSnapshot(meroData.rows); } catch { /* db optional */ }
    // Sync OHLCV from MeroLagani turnover (builds historical candle DB)
    try {
      if (meroData.raw?.turnover?.detail?.length && meroData.raw.turnover.date) {
        await syncMeroOhlcv(meroData.raw.turnover.date, meroData.raw.turnover.detail);
        // Also sync stock search table
        await saveStocks(meroData.raw.stock.detail.map((s) => ({
          symbol: s.s, name: s.s,
          lastTradedPrice: s.lp,
          percentageChange: calcMeroPercent(s),
          totalTradeQuantity: s.q,
        })));
      }
    } catch { /* ohlcv sync optional */ }
    return meroData;
  }

  // 2. Try direct NEPSE
  const nepse = getNepse();
  const live = await safeNepseCall(() => nepse.getLiveMarket(), "Live market data").catch(() => [] as LiveMarketData[]);
  if (Array.isArray(live) && live.length > 50) {
    globalThis.__lastLive = live;
    try { await saveLiveSnapshot(live); } catch { /* db optional */ }
    return { rows: live, source: "live" };
  }

  // 3. Security list + daily stats
  const [securities, stats] = await Promise.all([
    cached("seclist", 3_600_000, () => safeNepseCall(() => nepse.getSecurityList(), "Security list")).catch(() => []),
    getDailyTradeStats().catch(() => []),
  ]);
  const statMap = new Map(stats.map((s) => [s.symbol, s]));
  let ohlc = new Map<string, Ohlc>();
  try { ohlc = await getOhlcMap(); } catch { /* db optional */ }

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

  // 4. Snapshot / database
  if (globalThis.__lastLive?.length) {
    return { rows: globalThis.__lastLive, source: "snapshot" };
  }

  try {
    const [dbStocks, dbOhlc] = await Promise.all([getAllStocks(), getOhlcMap()]);
    if (dbStocks.length > 0) {
      const rows = dbStocks.map((s) => {
        const o = dbOhlc.get(s.symbol);
        return {
          securityId: 0,
          securityName: s.name,
          symbol: s.symbol,
          indexId: 0,
          openPrice: o?.openPrice ?? 0,
          highPrice: o?.highPrice ?? 0,
          lowPrice: o?.lowPrice ?? 0,
          totalTradeQuantity: s.totalTradeQuantity,
          totalTradeValue: (s.totalTradeQuantity ?? 0) * (s.lastTradedPrice ?? 0),
          lastTradedPrice: s.lastTradedPrice,
          percentageChange: s.percentageChange,
          lastUpdatedDateTime: "",
          lastTradedVolume: 0,
          previousClose: 0,
          averageTradedPrice: o?.averageTradedPrice ?? 0,
        };
      }) satisfies LiveMarketData[];
      return { rows, source: "database" };
    }
  } catch { /* db fallback failed */ }

  return { rows: [], source: "empty" };
}

export async function GET() {
  try {
    const { rows, source } = await cached("live", 3_000, loadAll);
    return Response.json({ data: rows, count: rows.length, source });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load live market" },
      { status: 502 },
    );
  }
}
