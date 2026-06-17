import { getNepse, cached, safeNepseCall, getDailyTradeStats } from "@/lib/nepse";
import { getAllStocks } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel deployment URL – always pull from here first
const VERCEL_BASE = "https://nepse-data-sand.vercel.app";

type Mover = { symbol: string; ltp: number; points: number; percentage: number; percentChange?: number; cp?: number };

type MoversResp = {
  gainers: Mover[];
  losers: Mover[];
  turnover: Mover[];
  volume: Mover[];
  transactions: Mover[];
  source: string;
};

// Fetch movers from Vercel deployment as PRIMARY source
async function fetchMoversFromVercel(): Promise<MoversResp | null> {
  try {
    const res = await fetch(`${VERCEL_BASE}/api/movers`, {
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
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
  // 1. Try Vercel first
  const vercelMovers = await fetchMoversFromVercel();
  if (vercelMovers) {
    return Response.json(vercelMovers);
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
