import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import { getAllStocks } from "@/lib/db";
import { fetchMeroLaganiSummary, calcMeroGainers, calcMeroLosers, calcMeroPercent } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mover = { symbol: string; ltp: number; points: number; percentage: number; percentChange?: number; cp?: number };

type MoversResp = {
  gainers: Mover[];
  losers: Mover[];
  turnover: Mover[];
  volume: Mover[];
  transactions: Mover[];
  source: string;
};

// Fetch movers from MeroLagani as PRIMARY source
async function fetchMoversFromMeroLagani(): Promise<MoversResp | null> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length) return null;

  const stocks = mero.stock.detail;
  
  // Top gainers
  const gainers = calcMeroGainers(stocks, 10).map((s) => ({
    symbol: s.s,
    ltp: s.lp,
    points: s.c,
    percentage: calcMeroPercent(s),
    percentChange: calcMeroPercent(s),
    cp: s.lp - s.c,
  }));

  // Top losers
  const losers = calcMeroLosers(stocks, 10).map((s) => ({
    symbol: s.s,
    ltp: s.lp,
    points: s.c,
    percentage: calcMeroPercent(s),
    percentChange: calcMeroPercent(s),
    cp: s.lp - s.c,
  }));

  // Top turnover (from turnover data)
  const turnover = (mero.turnover?.detail ?? []).slice(0, 10).map((s) => ({
    symbol: s.s,
    ltp: s.lp,
    points: s.pc,
    percentage: s.pc,
    percentChange: s.pc,
    cp: s.lp - (s.lp * s.pc / 100),
  }));

  // Top volume (sort stocks by quantity)
  const volume = [...stocks]
    .sort((a, b) => b.q - a.q)
    .slice(0, 10)
    .map((s) => ({
      symbol: s.s,
      ltp: s.lp,
      points: s.c,
      percentage: calcMeroPercent(s),
      percentChange: calcMeroPercent(s),
      cp: s.lp - s.c,
    }));

  // Top transactions (use volume as proxy since transactions not available)
  const transactions = volume;

  if (gainers.length > 0 || losers.length > 0) {
    return { gainers, losers, turnover, volume, transactions, source: "verified" };
  }
  return null;
}

// Calculate movers from database stocks when all else fails
async function getMoversFromDb(): Promise<MoversResp> {
  const stocks = await getAllStocks().catch(() => []);
  if (!stocks.length) {
    return { gainers: [], losers: [], turnover: [], volume: [], transactions: [], source: "empty" };
  }

  const mapped: Mover[] = stocks.map((s) => ({
    symbol: s.symbol,
    ltp: s.lastTradedPrice ?? 0,
    points: (s.lastTradedPrice ?? 0) * (s.percentageChange ?? 0) / 100,
    percentage: s.percentageChange ?? 0,
    percentChange: s.percentageChange ?? 0,
    cp: 0,
  }));

  const gainers = [...mapped].sort((a, b) => b.percentage - a.percentage).slice(0, 10);
  const losers = [...mapped].sort((a, b) => a.percentage - b.percentage).slice(0, 10);
  const turnover = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);
  const volume = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);
  const transactions = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);

  return { gainers, losers, turnover, volume, transactions, source: "database" };
}

export async function GET() {
  // 1. Try MeroLagani first (real NEPSE data)
  const meroMovers = await fetchMoversFromMeroLagani();
  if (meroMovers) {
    return Response.json(meroMovers);
  }

  // 2. Try direct NEPSE
  try {
    const nepse = getNepse();
    const data = await cached("movers", 8_000, async () => {
      const [gainers, losers, turnover, volume, transactions] = await Promise.all([
        safeNepseCall(() => nepse.getTopTenGainers(), "Top Gainers"),
        safeNepseCall(() => nepse.getTopTenLosers(), "Top Losers"),
        safeNepseCall(() => nepse.getTopTenTurnoverScrips(), "Top Turnover"),
        safeNepseCall(() => nepse.getTopTenTradeScrips(), "Top Volume"),
        safeNepseCall(() => nepse.getTopTenTransactionScrips(), "Top Transactions"),
      ]);
      return { gainers, losers, turnover, volume, transactions };
    });

    const hasData = data.gainers?.length > 0 || data.losers?.length > 0;
    if (hasData) {
      return Response.json(data);
    }
  } catch {
    // NEPSE failed
  }

  // 3. Database fallback
  try {
    const dbMovers = await getMoversFromDb();
    return Response.json(dbMovers);
  } catch {
    return Response.json({ gainers: [], losers: [], turnover: [], volume: [], transactions: [], source: "empty" });
  }
}
