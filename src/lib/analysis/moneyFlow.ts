// Module B: Money Flow Indicators
// CMF, MFI from OHLCV; Broker Concentration Index from broker_daily_agg
import "server-only";
import { execute } from "@/lib/db";

type OhlcvRow = { tradeDate: string; open: number; high: number; low: number; close: number; volume: number; value: number };

async function getOhlcvHistory(symbol: string, days: number): Promise<OhlcvRow[]> {
  const r = await execute(
    "SELECT tradeDate, open, high, low, close, volume, value FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT ?",
    [symbol, days],
  );
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    open: Number(row.open), high: Number(row.high), low: Number(row.low),
    close: Number(row.close), volume: Number(row.volume), value: Number(row.value),
  })).reverse();
}

// Chaikin Money Flow (20-day default)
// CMF = sum(((close - low) - (high - close)) / (high - low) * volume, 20) / sum(volume, 20)
export async function calcChaikinMoneyFlow(symbol: string, days = 20): Promise<{ cmf: number; days: number } | null> {
  const data = await getOhlcvHistory(symbol, days);
  if (data.length < days) return null;

  let mfvSum = 0, volSum = 0;
  for (const d of data) {
    const range = d.high - d.low;
    const mfm = range > 0 ? ((d.close - d.low) - (d.high - d.close)) / range : 0;
    mfvSum += mfm * d.volume;
    volSum += d.volume;
  }
  return { cmf: volSum > 0 ? mfvSum / volSum : 0, days: data.length };
}

// Money Flow Index (14-day default)
// MFI = 100 - (100 / (1 + money ratio))
// money ratio = avg positive money flow / avg negative money flow
export async function calcMoneyFlowIndex(symbol: string, days = 14): Promise<{ mfi: number; days: number } | null> {
  const data = await getOhlcvHistory(symbol, days + 1); // need +1 for price change calc
  if (data.length < days + 1) return null;

  let posFlow = 0, negFlow = 0;
  for (let i = 1; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    const prevTP = (data[i - 1].high + data[i - 1].low + data[i - 1].close) / 3;
    const rawFlow = typicalPrice * data[i].volume;
    if (typicalPrice > prevTP) posFlow += rawFlow;
    else negFlow += rawFlow;
  }
  const moneyRatio = negFlow > 0 ? posFlow / negFlow : posFlow > 0 ? 100 : 0;
  const mfi = 100 - (100 / (1 + moneyRatio));
  return { mfi, days: data.length - 1 };
}

// Broker Concentration Index: % of buy-side (and sell-side) volume from top 5 brokers
export async function calcBrokerConcentration(date: string, symbol: string): Promise<{ buyConc: number; sellConc: number; topBuyers: number; topSellers: number } | null> {
  const r = await execute(
    "SELECT brokerId, buyQty, sellQty FROM broker_daily_agg WHERE tradeDate = ? AND stockSymbol = ?",
    [date, symbol],
  );
  if (!r.rows.length) return null;

  const rows = r.rows.map((row) => ({ brokerId: String(row.brokerId), buyQty: Number(row.buyQty), sellQty: Number(row.sellQty) }));
  const totalBuy = rows.reduce((s, r) => s + r.buyQty, 0);
  const totalSell = rows.reduce((s, r) => s + r.sellQty, 0);

  const topBuyers = [...rows].sort((a, b) => b.buyQty - a.buyQty).slice(0, 5);
  const topSellers = [...rows].sort((a, b) => b.sellQty - a.sellQty).slice(0, 5);

  const topBuyQty = topBuyers.reduce((s, r) => s + r.buyQty, 0);
  const topSellQty = topSellers.reduce((s, r) => s + r.sellQty, 0);

  return {
    buyConc: totalBuy > 0 ? (topBuyQty / totalBuy) * 100 : 0,
    sellConc: totalSell > 0 ? (topSellQty / totalSell) * 100 : 0,
    topBuyers: topBuyers.length,
    topSellers: topSellers.length,
  };
}

// Multi-day concentration trend
export async function getConcentrationTrend(symbol: string, days = 5): Promise<Array<{ date: string; buyConc: number; sellConc: number }>> {
  const r = await execute(
    "SELECT DISTINCT tradeDate FROM broker_daily_agg WHERE stockSymbol = ? ORDER BY tradeDate DESC LIMIT ?",
    [symbol, days],
  );
  const dates = r.rows.map((row) => String(row.tradeDate)).reverse();
  const result: Array<{ date: string; buyConc: number; sellConc: number }> = [];
  for (const d of dates) {
    const c = await calcBrokerConcentration(d, symbol);
    if (c) result.push({ date: d, buyConc: c.buyConc, sellConc: c.sellConc });
  }
  return result;
}
