import { getNepse, cached, safeNepseCall, getDailyTradeStats } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mover = { symbol: string; ltp: number; points: number; percentage: number; cp?: number };

// Calculate movers from daily trade stats when NEPSE API is unreachable
async function getMoversFromStats(): Promise<{
  gainers: Mover[];
  losers: Mover[];
  turnover: Mover[];
  volume: Mover[];
  transactions: Mover[];
  source: string;
}> {
  const stats = await getDailyTradeStats().catch(() => []);
  if (!stats.length) {
    return { gainers: [], losers: [], turnover: [], volume: [], transactions: [], source: "empty" };
  }
  
  const mapped: Mover[] = stats.map((s) => ({
    symbol: s.symbol,
    ltp: s.lastTradedPrice ?? s.closePrice ?? 0,
    points: (s.lastTradedPrice ?? s.closePrice ?? 0) * (s.percentageChange ?? 0) / 100,
    percentage: s.percentageChange ?? 0,
    cp: s.previousClose ?? 0,
  }));
  
  const gainers = [...mapped].sort((a, b) => b.percentage - a.percentage).slice(0, 10);
  const losers = [...mapped].sort((a, b) => a.percentage - b.percentage).slice(0, 10);
  const turnover = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);
  const volume = [...mapped].sort((a, b) => (stats.find(s => s.symbol === b.symbol)?.totalTradeQuantity ?? 0) - (stats.find(s => s.symbol === a.symbol)?.totalTradeQuantity ?? 0)).slice(0, 10);
  const transactions = [...mapped].sort((a, b) => b.ltp - a.ltp).slice(0, 10);
  
  return { gainers, losers, turnover, volume, transactions, source: "stats" };
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
    
    // Fallback to daily trade stats
    const statsMovers = await getMoversFromStats();
    return Response.json(statsMovers);
  } catch (e) {
    // Fallback to daily trade stats on error
    try {
      const statsMovers = await getMoversFromStats();
      return Response.json(statsMovers);
    } catch {
      return Response.json({ gainers: [], losers: [], turnover: [], volume: [], transactions: [], source: "empty" });
    }
  }
}
