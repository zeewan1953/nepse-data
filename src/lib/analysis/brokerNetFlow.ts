// Module A: Broker Net Flow analysis
// Per stock per day: net buy/sell qty and value per broker
// Rolling multi-day net flow trend, unusual flow detection
import "server-only";
import { execute } from "@/lib/db";

export type BrokerFlow = {
  brokerId: string;
  buyQty: number; buyAmt: number;
  sellQty: number; sellAmt: number;
  netQty: number; netAmt: number;
};

// Per stock per day: net flow per broker from broker_daily_agg
export async function getBrokerNetFlow(date: string, symbol: string): Promise<BrokerFlow[]> {
  const r = await execute(
    "SELECT brokerId, buyQty, buyAmt, sellQty, sellAmt, netQty, netAmt FROM broker_daily_agg WHERE tradeDate = ? AND stockSymbol = ? ORDER BY netAmt DESC",
    [date, symbol],
  );
  return r.rows.map((row) => ({
    brokerId: String(row.brokerId),
    buyQty: Number(row.buyQty), buyAmt: Number(row.buyAmt),
    sellQty: Number(row.sellQty), sellAmt: Number(row.sellAmt),
    netQty: Number(row.netQty), netAmt: Number(row.netAmt),
  }));
}

// Rolling N-day net flow trend per broker for a stock
export async function getRollingNetFlow(symbol: string, days: number): Promise<Array<{ date: string; flows: BrokerFlow[] }>> {
  const r = await execute(
    "SELECT DISTINCT tradeDate FROM broker_daily_agg WHERE stockSymbol = ? ORDER BY tradeDate DESC LIMIT ?",
    [symbol, days],
  );
  const dates = r.rows.map((row) => String(row.tradeDate)).reverse();
  if (!dates.length) return [];

  const result: Array<{ date: string; flows: BrokerFlow[] }> = [];
  for (const d of dates) {
    const flows = await getBrokerNetFlow(d, symbol);
    result.push({ date: d, flows });
  }
  return result;
}

// Flag unusual flow: broker's net qty vs stock's typical daily volume
// Returns z-score; > 2 = unusual
export async function flagUnusualFlow(symbol: string, brokerId: string, date: string): Promise<{ zScore: number; avgDailyQty: number; brokerQty: number }> {
  // Get broker's net qty for this date
  const br = await execute(
    "SELECT netQty FROM broker_daily_agg WHERE tradeDate = ? AND stockSymbol = ? AND brokerId = ?",
    [date, symbol, brokerId],
  );
  const brokerQty = br.rows.length ? Math.abs(Number(br.rows[0].netQty)) : 0;

  // Get avg daily total qty for this stock over last 20 days
  const r = await execute(
    `SELECT AVG(dailyQty) as avgQty FROM (
      SELECT tradeDate, SUM(buyQty) as dailyQty FROM broker_daily_agg
      WHERE stockSymbol = ? AND tradeDate <= ? GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 20
    )`,
    [symbol, date],
  );
  const avgDailyQty = Number(r.rows[0]?.avgQty ?? 0);
  if (!avgDailyQty) return { zScore: 0, avgDailyQty: 0, brokerQty };

  // Get std dev
  const r2 = await execute(
    `SELECT AVG(dailyQty * dailyQty) as avgSq FROM (
      SELECT tradeDate, SUM(buyQty) as dailyQty FROM broker_daily_agg
      WHERE stockSymbol = ? AND tradeDate <= ? GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 20
    )`,
    [symbol, date],
  );
  const avgSq = Number(r2.rows[0]?.avgSq ?? 0);
  const stdDev = Math.sqrt(Math.max(0, avgSq - avgDailyQty * avgDailyQty));
  const zScore = stdDev > 0 ? (brokerQty - avgDailyQty) / stdDev : 0;

  return { zScore, avgDailyQty, brokerQty };
}

// Top net-buying and top net-selling brokers for a stock on a date
export async function getTopBrokers(date: string, symbol: string, limit = 5) {
  const flows = await getBrokerNetFlow(date, symbol);
  const buyers = flows.filter((f) => f.netAmt > 0).sort((a, b) => b.netAmt - a.netAmt).slice(0, limit);
  const sellers = flows.filter((f) => f.netAmt < 0).sort((a, b) => a.netAmt - b.netAmt).slice(0, limit);
  return { buyers, sellers };
}
