// Module G: Next-Move Scanner
// Returns separate LONG (buy) and SHORT (sell) picks
// Lower thresholds ensure data is always returned
import "server-only";
import { execute } from "@/lib/db";
import { calcBrokerConcentration } from "./moneyFlow";
import { calcVolumeZScore } from "./anomaly";

export type ScannerPick = {
  symbol: string;
  name: string;
  score: number;
  direction: "LONG" | "SHORT";
  reasons: string[];
  buyConc: number;
  sellConc: number;
  netBrokerAmt: number;
  totalBuyAmt: number;
  totalSellAmt: number;
  volumeZScore: number;
  todayVolume: number;
  avgVolume: number;
  cmf: number | null;
  priceChange: number;
};

// Scan all stocks traded today → return { longPicks, shortPicks }
export async function scanNextMove(date: string, limit = 5): Promise<{ longPicks: ScannerPick[]; shortPicks: ScannerPick[] }> {
  // Get all stocks traded today — lower threshold to ensure we get data
  const r = await execute(
    `SELECT stockSymbol, SUM(buyAmt) as totalBuy, SUM(sellAmt) as totalSell,
            SUM(buyQty) as totalBuyQty, SUM(sellQty) as totalSellQty,
            COUNT(DISTINCT brokerId) as brokerCount
     FROM broker_daily_agg WHERE tradeDate = ?
     GROUP BY stockSymbol
     HAVING totalBuy + totalSell > 10000
     ORDER BY (totalBuy + totalSell) DESC
     LIMIT 80`,
    [date],
  );

  if (!r.rows.length) return { longPicks: [], shortPicks: [] };

  const longCandidates: ScannerPick[] = [];
  const shortCandidates: ScannerPick[] = [];

  for (const row of r.rows) {
    const symbol = String(row.stockSymbol);
    const totalBuy = Number(row.totalBuy);
    const totalSell = Number(row.totalSell);
    const netBrokerAmt = totalBuy - totalSell;

    // Parallel fetch signals
    const [conc, volZ, ohlcv] = await Promise.all([
      calcBrokerConcentration(date, symbol),
      calcVolumeZScore(symbol, date),
      execute("SELECT close FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT 2", [symbol]),
    ]);

    const buyConc = conc?.buyConc ?? 0;
    const sellConc = conc?.sellConc ?? 0;

    // CMF inline calc
    const cmfData = await execute(
      `SELECT open, high, low, close, volume FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT 20`,
      [symbol],
    );
    let cmf: number | null = null;
    if (cmfData.rows.length >= 5) {
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

    // Price change
    const closes = ohlcv.rows.map((rr) => Number(rr.close));
    const priceChange = closes.length >= 2 && closes[1] > 0
      ? ((closes[0] - closes[1]) / closes[1]) * 100 : 0;

    // ─── LONG score (buy signals) ───
    let longScore = 0;
    const longReasons: string[] = [];

    // Buy dominance
    if (totalBuy > totalSell) {
      const ratio = totalSell > 0 ? totalBuy / totalSell : totalBuy > 0 ? 10 : 0;
      if (ratio > 1.2) {
        longScore += Math.min(ratio * 1.5, 5);
        longReasons.push(`Buy/Sell ratio ${ratio.toFixed(1)}x`);
      }
    }

    // Buy concentration
    if (buyConc > 40 && buyConc > sellConc) {
      longScore += (buyConc - sellConc) * 0.3;
      longReasons.push(`Buy conc ${buyConc.toFixed(0)}% (top 5 brokers)`);
    }

    // Net buying
    if (netBrokerAmt > 0) {
      longScore += Math.min(netBrokerAmt / 200000, 3);
      longReasons.push(`Net buy Rs ${netBrokerAmt > 1e6 ? (netBrokerAmt / 1e6).toFixed(1) + "M" : (netBrokerAmt / 1e3).toFixed(0) + "K"}`);
    }

    // Volume spike
    if (volZ.zScore > 1) {
      longScore += volZ.zScore * 0.5;
      longReasons.push(`Vol spike Z=${volZ.zScore.toFixed(1)}`);
    }

    // CMF positive
    if (cmf !== null && cmf > 0) {
      longScore += cmf * 4;
      longReasons.push(`CMF +${cmf.toFixed(3)} (accumulation)`);
    }

    // Multi-broker
    const brokerCount = Number(row.brokerCount);
    if (brokerCount >= 5) {
      longScore += 0.3;
      longReasons.push(`${brokerCount} brokers active`);
    }

    // ─── SHORT score (sell signals) ───
    let shortScore = 0;
    const shortReasons: string[] = [];

    // Sell dominance
    if (totalSell > totalBuy) {
      const ratio = totalBuy > 0 ? totalSell / totalBuy : totalSell > 0 ? 10 : 0;
      if (ratio > 1.2) {
        shortScore += Math.min(ratio * 1.5, 5);
        shortReasons.push(`Sell/Buy ratio ${ratio.toFixed(1)}x`);
      }
    }

    // Sell concentration
    if (sellConc > 40 && sellConc > buyConc) {
      shortScore += (sellConc - buyConc) * 0.3;
      shortReasons.push(`Sell conc ${sellConc.toFixed(0)}% (top 5 brokers)`);
    }

    // Net selling
    if (netBrokerAmt < 0) {
      const absNet = Math.abs(netBrokerAmt);
      shortScore += Math.min(absNet / 200000, 3);
      shortReasons.push(`Net sell Rs ${absNet > 1e6 ? (absNet / 1e6).toFixed(1) + "M" : (absNet / 1e3).toFixed(0) + "K"}`);
    }

    // Volume spike (also relevant for shorts)
    if (volZ.zScore > 1) {
      shortScore += volZ.zScore * 0.5;
      shortReasons.push(`Vol spike Z=${volZ.zScore.toFixed(1)}`);
    }

    // CMF negative (distribution)
    if (cmf !== null && cmf < 0) {
      shortScore += Math.abs(cmf) * 4;
      shortReasons.push(`CMF ${cmf.toFixed(3)} (distribution)`);
    }

    if (brokerCount >= 5) {
      shortScore += 0.3;
      shortReasons.push(`${brokerCount} brokers active`);
    }

    const base = {
      symbol, name: symbol.replace(/\d+/g, ""),
      buyConc, sellConc, netBrokerAmt, totalBuyAmt: totalBuy, totalSellAmt: totalSell,
      volumeZScore: volZ.zScore, todayVolume: volZ.todayVolume, avgVolume: volZ.avgVolume,
      cmf, priceChange,
    };

    // Always add if there's at least 1 reason (lower threshold)
    if (longScore >= 1 && longReasons.length >= 1) {
      longCandidates.push({ ...base, score: longScore, direction: "LONG", reasons: longReasons.slice(0, 4) });
    }
    if (shortScore >= 1 && shortReasons.length >= 1) {
      shortCandidates.push({ ...base, score: shortScore, direction: "SHORT", reasons: shortReasons.slice(0, 4) });
    }
  }

  // Sort by score desc, return top picks
  return {
    longPicks: longCandidates.sort((a, b) => b.score - a.score).slice(0, limit),
    shortPicks: shortCandidates.sort((a, b) => b.score - a.score).slice(0, limit),
  };
}
