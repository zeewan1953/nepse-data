// Module D: Anomaly/Spike Detection
// Z-score volume analysis + broker concentration spike detection
import "server-only";
import { execute } from "@/lib/db";
import { calcBrokerConcentration } from "./moneyFlow";

// Volume z-score: today's volume vs trailing 20-day avg
export async function calcVolumeZScore(symbol: string, date: string): Promise<{ zScore: number; avgVolume: number; todayVolume: number; stdDev: number }> {
  // Get last 20 days of OHLCV (inclusive of date)
  const r = await execute(
    "SELECT tradeDate, volume FROM stock_daily_ohlcv WHERE symbol = ? AND tradeDate <= ? ORDER BY tradeDate DESC LIMIT 20",
    [symbol, date],
  );
  const rows = r.rows.map((row) => ({ date: String(row.tradeDate), volume: Number(row.volume) }));
  if (rows.length < 3) return { zScore: 0, avgVolume: 0, todayVolume: rows[0]?.volume ?? 0, stdDev: 0 };

  const todayVolume = rows[0].volume;
  const historical = rows.slice(1);
  const avgVolume = historical.reduce((s, r) => s + r.volume, 0) / historical.length;
  const avgSq = historical.reduce((s, r) => s + r.volume * r.volume, 0) / historical.length;
  const stdDev = Math.sqrt(Math.max(0, avgSq - avgVolume * avgVolume));
  const zScore = stdDev > 0 ? (todayVolume - avgVolume) / stdDev : 0;

  return { zScore, avgVolume, todayVolume, stdDev };
}

// Detect anomalies for a date: combine volume z-score with concentration spike
export async function detectAnomalies(date: string): Promise<Array<{
  symbol: string; volumeZScore: number; buyConc: number; sellConc: number;
  score: number; flag: string;
}>> {
  // Get all stocks traded today
  const r = await execute(
    "SELECT DISTINCT stockSymbol FROM broker_daily_agg WHERE tradeDate = ?",
    [date],
  );
  const symbols = r.rows.map((row) => String(row.stockSymbol));

  const results: Array<{ symbol: string; volumeZScore: number; buyConc: number; sellConc: number; score: number; flag: string }> = [];

  for (const sym of symbols) {
    const [vol, conc] = await Promise.all([
      calcVolumeZScore(sym, date),
      calcBrokerConcentration(date, sym),
    ]);

    const buyConc = conc?.buyConc ?? 0;
    const sellConc = conc?.sellConc ?? 0;
    const maxConc = Math.max(buyConc, sellConc);

    // Combined score: volume z-score * concentration factor
    const concFactor = maxConc > 50 ? 2 : maxConc > 30 ? 1.5 : 1;
    const score = vol.zScore * concFactor;

    if (score > 1.5) {
      let flag = "notable";
      if (score > 3) flag = "highly_unusual";
      else if (score > 2) flag = "unusual";

      results.push({
        symbol: sym,
        volumeZScore: vol.zScore,
        buyConc,
        sellConc,
        score,
        flag,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// Anomaly leaderboard: top accumulation/distribution candidates NEPSE-wide
export async function getAnomalyLeaderboard(date: string, limit = 20): Promise<{
  accumulation: Array<{ symbol: string; score: number; volumeZScore: number; buyConc: number }>;
  distribution: Array<{ symbol: string; score: number; volumeZScore: number; sellConc: number }>;
}> {
  const anomalies = await detectAnomalies(date);

  // Accumulation: high buy concentration + positive volume spike
  const accumulation = anomalies
    .filter((a) => a.buyConc > a.sellConc)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((a) => ({ symbol: a.symbol, score: a.score, volumeZScore: a.volumeZScore, buyConc: a.buyConc }));

  // Distribution: high sell concentration + volume spike
  const distribution = anomalies
    .filter((a) => a.sellConc > a.buyConc)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((a) => ({ symbol: a.symbol, score: a.score, volumeZScore: a.volumeZScore, sellConc: a.sellConc }));

  return { accumulation, distribution };
}
