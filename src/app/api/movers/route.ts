import { getNepse, cached, safeNepseCall, getDailyTradeStats } from "@/lib/nepse";
import { getAllStocks } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel deployment URL for fallback when NEPSE is unreachable locally
const VERCEL_BASE = "https://nepse-data-sand.vercel.app";

type Mover = { symbol: string; ltp: number; points: number; percentage: number; percentChange?: number; cp?: number };

// Fetch movers from Vercel deployment
async function fetchMoversFromVercel(): Promise<{
  gainers: Mover[];
  losers: Mover[];
  turnover: Mover[];
  volume: Mover[];
  transactions: Mover[];
  source: string;
} | null> {
  try {
    const res = await fetch(`${VERCEL_BASE}/api/movers`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.gainers?.length > 0 || data.losers?.length > 0) {
      return { ...data, source: "vercel" };
    }
  } catch {
    // Vercel fetch failed
  }
  return null;
}

// Calculate movers from database stocks when NEPSE API is unreachable
async function getMoversFromDb(): Promise<{
  gainers: Mover[];
  losers: Mover[];
  turnover: Mover[];
  volume: Mover[];
  transactions: Mover[];
  source: string;
}> {
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
  const turnover = [...mapped].sort((a, b) => (b.ltp * 1000) - (a.ltp * 1000)).slice(0, 10);
  const volume = [...mapped].sort((a, b) => (b.ltp * 1000) - (a.ltp * 1000)).slice(0, 10);
  const transactions = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);
  
  return { gainers, losers, turnover, volume, transactions, source: "database" };
}

// Top gainers, losers, by turnover, by volume (shares traded) and by number of
// transactions — everything the dashboard needs in one round trip.
export async function GET() {
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
    
    // Check if we got valid data
    const hasData = data.gainers?.length > 0 || data.losers?.length > 0;
    if (hasData) {
      return Response.json(data);
    }
    
    // Fallback to Vercel deployment
    const vercelMovers = await fetchMoversFromVercel();
    if (vercelMovers) {
      return Response.json(vercelMovers);
    }
    
    // Fallback to database stocks
    const statsMovers = await getMoversFromDb();
    return Response.json(statsMovers);
  } catch (e) {
    // Fallback to Vercel deployment on error
    try {
      const vercelMovers = await fetchMoversFromVercel();
      if (vercelMovers) {
        return Response.json(vercelMovers);
      }
    } catch {
      // Vercel fetch failed
    }
    // Fallback to database stocks
    try {
      const statsMovers = await getMoversFromDb();
      return Response.json(statsMovers);
    } catch {
      return Response.json({ gainers: [], losers: [], turnover: [], volume: [], transactions: [], source: "empty" });
    }
  }
}
