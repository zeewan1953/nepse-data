/**
 * Real NEPSE data loader — queries the DB for broker flow analytics.
 *
 * All functions return data in the same shape as the sample fixtures
 * (FloorsheetRow, OHLCVBar) so the analytics engine can consume them directly.
 *
 * If no real data is available (DB empty / sync never ran), functions return
 * empty arrays and the caller should fall back to sample data.
 */

import { db } from "@/lib/db";
import type { OHLCVBar, FloorsheetRow } from "./broker_flow_analytics";

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

/**
 * Get last N trading dates from the DB (dates that have broker_daily_agg data).
 */
export async function getAvailableTradeDates(limit = 30): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT DISTINCT tradeDate FROM broker_daily_agg ORDER BY tradeDate DESC LIMIT ?",
    args: [limit],
  });
  return r.rows.map((row) => String(row.tradeDate));
}

/**
 * Check if real data exists for a given date.
 */
export async function hasRealData(date: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM broker_daily_agg WHERE tradeDate = ?",
    args: [date],
  });
  return Number(r.rows[0]?.cnt ?? 0) > 0;
}

/**
 * Get the most recent date that has data.
 */
export async function getLatestDataDate(): Promise<string | null> {
  const r = await db.execute(
    "SELECT MAX(tradeDate) as d FROM broker_daily_agg"
  );
  return r.rows[0]?.d ? String(r.rows[0].d) : null;
}

// ─── Broker Flows (from broker_daily_agg) ───────────────────────────────────

export type BrokerAggRow = {
  tradeDate: string;
  stockSymbol: string;
  brokerId: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
};

/**
 * Get broker aggregation rows for a single date from the DB.
 * Returns pre-computed buy/sell per broker per stock.
 */
export async function getRealBrokerAgg(date: string): Promise<BrokerAggRow[]> {
  const r = await db.execute({
    sql: `SELECT tradeDate, stockSymbol, brokerId,
          buyQty, buyAmt, sellQty, sellAmt
          FROM broker_daily_agg
          WHERE tradeDate = ?`,
    args: [date],
  });
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    stockSymbol: String(row.stockSymbol),
    brokerId: String(row.brokerId),
    buyQty: Number(row.buyQty),
    buyAmt: Number(row.buyAmt),
    sellQty: Number(row.sellQty),
    sellAmt: Number(row.sellAmt),
  }));
}

/**
 * Get broker aggregation for multiple dates (for cross-stock patterns).
 */
export async function getRealMultiDayBrokerAgg(
  dates: string[]
): Promise<BrokerAggRow[]> {
  if (dates.length === 0) return [];
  const placeholders = dates.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT tradeDate, stockSymbol, brokerId,
          buyQty, buyAmt, sellQty, sellAmt
          FROM broker_daily_agg
          WHERE tradeDate IN (${placeholders})`,
    args: dates,
  });
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    stockSymbol: String(row.stockSymbol),
    brokerId: String(row.brokerId),
    buyQty: Number(row.buyQty),
    buyAmt: Number(row.buyAmt),
    sellQty: Number(row.sellQty),
    sellAmt: Number(row.sellAmt),
  }));
}

/**
 * Convert broker_daily_agg rows to FloorsheetRow-compatible format
 * for use with computeBrokerNetFlow(). Each agg row becomes one
 * synthetic "trade" per broker-stock pair.
 */
export function aggToFloorsheetRows(aggRows: BrokerAggRow[]): FloorsheetRow[] {
  const rows: FloorsheetRow[] = [];
  for (const a of aggRows) {
    const brokerId = Number(a.brokerId);
    // Buy side
    if (a.buyQty > 0) {
      rows.push({
        timestamp: `${a.tradeDate}T12:00:00`,
        symbol: a.stockSymbol,
        qty: a.buyQty,
        price: a.buyQty > 0 ? a.buyAmt / a.buyQty : 0,
        buyerBrokerId: brokerId,
        sellerBrokerId: 0, // placeholder — net flow only needs buyer side
      });
    }
    // Sell side
    if (a.sellQty > 0) {
      rows.push({
        timestamp: `${a.tradeDate}T12:00:00`,
        symbol: a.stockSymbol,
        qty: a.sellQty,
        price: a.sellQty > 0 ? a.sellAmt / a.sellQty : 0,
        buyerBrokerId: 0, // placeholder
        sellerBrokerId: brokerId,
      });
    }
  }
  return rows;
}

// ─── Raw Trades (from floorsheet_trades) ────────────────────────────────────

/**
 * Get raw floorsheet trades for a date, optionally filtered by symbol.
 * Used for tick-rule buy/sell classification.
 */
export async function getRealTrades(
  date: string,
  symbol?: string
): Promise<FloorsheetRow[]> {
  const args: (string | number)[] = [date];
  let where = "tradeDate = ?";
  if (symbol) {
    where += " AND stockSymbol = ?";
    args.push(symbol);
  }
  const r = await db.execute({
    sql: `SELECT stockSymbol, buyerMemberId, sellerMemberId,
          contractQuantity, contractAmount, tradeOrder
          FROM floorsheet_trades
          WHERE ${where}
          ORDER BY tradeOrder ASC`,
    args,
  });
  return r.rows.map((row) => ({
    timestamp: `${date}T12:00:00`,
    symbol: String(row.stockSymbol),
    qty: Number(row.contractQuantity),
    price: Number(row.contractQuantity) > 0
      ? Number(row.contractAmount) / Number(row.contractQuantity)
      : 0,
    buyerBrokerId: Number(row.buyerMemberId),
    sellerBrokerId: Number(row.sellerMemberId),
  }));
}

// ─── OHLCV History (from stock_daily_ohlcv) ─────────────────────────────────

/**
 * Get OHLCV bars for a symbol from the DB.
 * Returns ascending order (oldest first), like the sample generator.
 */
export async function getRealOHLCV(
  symbol: string,
  days: number
): Promise<OHLCVBar[]> {
  const r = await db.execute({
    sql: `SELECT tradeDate, open, high, low, close, volume
          FROM stock_daily_ohlcv
          WHERE symbol = ?
          ORDER BY tradeDate DESC
          LIMIT ?`,
    args: [symbol, days],
  });
  return r.rows
    .map((row) => ({
      date: String(row.tradeDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .reverse(); // oldest first
}

// ─── Full Pipeline: get last N trading dates ────────────────────────────────

/**
 * Get the last N trading dates that have broker_daily_agg data,
 * looking back from the given date.
 */
export async function getLastNTradingDates(
  fromDate: string,
  count: number
): Promise<string[]> {
  const r = await db.execute({
    sql: `SELECT DISTINCT tradeDate FROM broker_daily_agg
          WHERE tradeDate <= ?
          ORDER BY tradeDate DESC
          LIMIT ?`,
    args: [fromDate, count],
  });
  return r.rows.map((row) => String(row.tradeDate));
}

/**
 * Get all unique stock symbols that traded on a date.
 */
export async function getTradedSymbols(date: string): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT DISTINCT stockSymbol FROM broker_daily_agg WHERE tradeDate = ?",
    args: [date],
  });
  return r.rows.map((row) => String(row.stockSymbol));
}
