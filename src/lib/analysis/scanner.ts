// Module G: Next-Move Scanner
// Combines broker concentration, CMF, volume z-score, and net flow
// to surface the 5 stocks most likely to make a significant move.
import "server-only";
import { execute } from "@/lib/db";
import { calcBrokerConcentration } from "./moneyFlow";
import { calcVolumeZScore } from "./anomaly";

export type ScannerPick = {
  symbol: string;
  name: string;
  score: number;
  direction: "UP" | "DOWN";
  reasons: string[];
  // supporting data
  buyConc: number;
  sellConc: number;
  netBrokerAmt: number;
  volumeZScore: number;
  todayVolume: number;
  avgVolume: number;
  cmf: number | null;
  priceChange: number; // % change today
};

// Scan all stocks traded today and return top 5 picks for next move
export async function scanNextMove(date: string, limit = 5): Promise<ScannerPick[]> {
  // Get all stocks traded today with their total amounts
  const r = await execute(
    `SELECT stockSymbol, SUM(buyAmt) as totalBuy, SUM(sellAmt) as totalSell,
            SUM(buyQty) as totalBuyQty, SUM(sellQty) as totalSellQty,
            COUNT(DISTINCT brokerId) as brokerCount
     FROM broker_daily_agg WHERE tradeDate = ?
     GROUP BY stockSymbol
     HAVING totalBuy + totalSell > 50000
     ORDER BY (totalBuy + totalSell) DESC
     LIMIT 60`,
    [date],
  );

  if (!r.rows.length) return [];

  const candidates: ScannerPick[] = [];

  for (const row of r.rows) {
    const symbol = String(row.stockSymbol);
    const totalBuy = Number(row.totalBuy);
    const totalSell = Number(row.totalSell);
    const totalBuyQty = Number(row.totalBuyQty);
    const totalSellQty = Number(row.totalSellQty);
    const netBrokerAmt = totalBuy - totalSell;

    // Parallel fetch all signals
    const [conc, volZ, ohlcv] = await Promise.all([
      calcBrokerConcentration(date, symbol),
      calcVolumeZScore(symbol, date),
      // Get last 2 days for price change
      execute(
        "SELECT close FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT 2",
        [symbol],
      ),
    ]);

    const buyConc = conc?.buyConc ?? 0;
    const sellConc = conc?.sellConc ?? 0;

    // CMF from OHLCV (quick inline calc from available data)
    const cmfData = await execute(
      `SELECT open, high, low, close, volume FROM stock_daily_ohlcv
       WHERE symbol = ? ORDER BY tradeDate DESC LIMIT 20`,
      [symbol],
    );
    let cmf: number | null = null;
    if (cmfData.rows.length >= 10) {
      const rows = cmfData.rows.map((rr) => ({
        high: Number(rr.high), low: Number(rr.low), close: Number(rr.close), volume: Number(rr.volume),
      }));
      let mfvSum = 0, volSum = 0;
      for (const d of rows) {
        const range = d.high - d.low;
        const mfm = range > 0 ? ((d.close - d.low) - (d.high - d.close)) / range : 0;
        mfvSum += mfm * d.volume;
        volSum += d.volume;
      }
      cmf = volSum > 0 ? mfvSum / volSum : null;
    }

    // Price change %
    const closes = ohlcv.rows.map((rr) => Number(rr.close));
    const priceChange = closes.length >= 2 && closes[1] > 0
      ? ((closes[0] - closes[1]) / closes[1]) * 100
      : 0;

    // ─── Scoring logic ───
    let score = 0;
    const reasons: string[] = [];
    let direction: "UP" | "DOWN" = "UP";

    // 1. Buy concentration dominance (top 5 brokers control buy side)
    if (buyConc > 55 && buyConc > sellConc) {
      score += (buyConc - sellConc) * 0.4;
      reasons.push(`Buy conc ${buyConc.toFixed(0)}% >> sell ${sellConc.toFixed(0)}%`);
      direction = "UP";
    } else if (sellConc > 55 && sellConc > buyConc) {
      score += (sellConc - buyConc) * 0.4;
      reasons.push(`Sell conc ${sellConc.toFixed(0)}% >> buy ${buyConc.toFixed(0)}%`);
      direction = "DOWN";
    }

    // 2. Net broker flow direction
    const netAbs = Math.abs(netBrokerAmt);
    if (netAbs > 100000) {
      score += Math.min(netAbs / 500000, 3);
      if (netBrokerAmt > 0) {
        reasons.push(`Net buy Rs ${netAbs > 1e6 ? (netAbs / 1e6).toFixed(1) + "M" : (netAbs / 1e3).toFixed(0) + "K"}`);
        direction = "UP";
      } else {
        reasons.push(`Net sell Rs ${netAbs > 1e6 ? (netAbs / 1e6).toFixed(1) + "M" : (netAbs / 1e3).toFixed(0) + "K"}`);
        direction = "DOWN";
      }
    }

    // 3. Volume spike
    if (volZ.zScore > 1.5) {
      score += volZ.zScore * 0.8;
      reasons.push(`Vol spike Z=${volZ.zScore.toFixed(1)}x`);
    }

    // 4. CMF confirmation
    if (cmf !== null && Math.abs(cmf) > 0.1) {
      score += Math.abs(cmf) * 5;
      if (cmf > 0) {
        reasons.push(`CMF +${cmf.toFixed(3)} (accumulation)`);
        if (direction === "UP") score += 1; // alignment bonus
      } else {
        reasons.push(`CMF ${cmf.toFixed(3)} (distribution)`);
        if (direction === "DOWN") score += 1;
      }
    }

    // 5. Multi-broker participation (more brokers = stronger signal)
    const brokerCount = Number(row.brokerCount);
    if (brokerCount >= 8) {
      score += 0.5;
      reasons.push(`${brokerCount} brokers active`);
    }

    if (score >= 2 && reasons.length >= 2) {
      candidates.push({
        symbol,
        name: symbol.replace(/\d+/g, ""),
        score,
        direction,
        reasons: reasons.slice(0, 4),
        buyConc,
        sellConc,
        netBrokerAmt,
        volumeZScore: volZ.zScore,
        todayVolume: volZ.todayVolume,
        avgVolume: volZ.avgVolume,
        cmf,
        priceChange,
      });
    }
  }

  // Sort by score descending, return top picks
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}
