import "server-only";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import type { InArgs } from "@libsql/client";

// ─── Local SQLite database (auth + OHLC market data) ──────────────────────
let localDbUrl: string;

if (process.env.VERCEL === "1") {
  localDbUrl = ":memory:";
} else {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  localDbUrl = pathToFileURL(path.join(dataDir, "darisir.db")).href;
}

export const db = createClient({ url: localDbUrl });

type SqlArgs = InArgs;

// ─── Schema migrations ───────────────────────────────────────────────────
async function migrateSchema(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      mobile TEXT,
      name TEXT,
      passwordHash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add createdAt column to sessions if missing
  try {
    await db.execute("ALTER TABLE sessions ADD COLUMN createdAt INTEGER DEFAULT 0");
  } catch {
    // already exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS otps (
      email TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS live_ohlc (
      symbol TEXT PRIMARY KEY,
      openPrice REAL NOT NULL,
      highPrice REAL NOT NULL,
      lowPrice REAL NOT NULL,
      averageTradedPrice REAL NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // All NEPSE stocks for search
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stocks (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lastTradedPrice REAL NOT NULL DEFAULT 0,
      percentageChange REAL NOT NULL DEFAULT 0,
      totalTradeQuantity REAL NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    )
  `);

  // Floorsheet trades stored by date for historical querying
  await db.execute(`
    CREATE TABLE IF NOT EXISTS floorsheet_trades (
      tradeDate TEXT NOT NULL,
      stockSymbol TEXT NOT NULL,
      securityName TEXT NOT NULL,
      buyerMemberId TEXT NOT NULL,
      sellerMemberId TEXT NOT NULL,
      contractQuantity REAL NOT NULL,
      contractAmount REAL NOT NULL,
      tradeOrder INTEGER NOT NULL DEFAULT 0,
      syncedAt INTEGER NOT NULL
    )
  `);

  // Pre-computed daily broker-stock aggregation for fast rolling queries
  await db.execute(`
    CREATE TABLE IF NOT EXISTS broker_daily_agg (
      tradeDate TEXT NOT NULL,
      stockSymbol TEXT NOT NULL,
      brokerId TEXT NOT NULL,
      buyQty REAL NOT NULL DEFAULT 0,
      buyAmt REAL NOT NULL DEFAULT 0,
      sellQty REAL NOT NULL DEFAULT 0,
      sellAmt REAL NOT NULL DEFAULT 0,
      netQty REAL NOT NULL DEFAULT 0,
      netAmt REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (tradeDate, stockSymbol, brokerId)
    )
  `);

  // Daily OHLCV for CMF/MFI calculations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stock_daily_ohlcv (
      tradeDate TEXT NOT NULL,
      symbol TEXT NOT NULL,
      open REAL NOT NULL DEFAULT 0,
      high REAL NOT NULL DEFAULT 0,
      low REAL NOT NULL DEFAULT 0,
      close REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      value REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (tradeDate, symbol)
    )
  `);

  // Indexes for fast floorsheet queries
  try {
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_date ON floorsheet_trades(tradeDate)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_buyer ON floorsheet_trades(tradeDate, buyerMemberId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_seller ON floorsheet_trades(tradeDate, sellerMemberId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_stock ON floorsheet_trades(tradeDate, stockSymbol)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_order ON floorsheet_trades(tradeDate, stockSymbol, tradeOrder)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_bda_symbol ON broker_daily_agg(stockSymbol, tradeDate)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_bda_broker ON broker_daily_agg(tradeDate, brokerId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol ON stock_daily_ohlcv(symbol, tradeDate)");
  } catch { /* indexes may already exist */ }

  // Add createdAt column if missing
  try {
    await db.execute("ALTER TABLE otps ADD COLUMN createdAt INTEGER DEFAULT 0");
  } catch {
    // already exists
  }

  // Add unique index on otps email for upsert safety
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_otps_email ON otps(email)");
  } catch {
    // index may already exist or table was created differently
  }
}
migrateSchema().catch(console.error);

// ─── Query helpers ───────────────────────────────────────────────────────
export async function execute(sql: string, args?: SqlArgs) {
  return db.execute(sql, args);
}

export async function one<T = unknown>(sql: string, args?: SqlArgs): Promise<T | undefined> {
  const result = await execute(sql, args);
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function run(sql: string, args?: SqlArgs) {
  return execute(sql, args);
}

// ─── OHLC market data ────────────────────────────────────────────────────
type OhlcRow = {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  averageTradedPrice: number;
};

export async function saveLiveSnapshot(live: Array<OhlcRow>): Promise<void> {
  if (!live.length) return;

  const statements = live.map((row) => ({
    sql: `INSERT INTO live_ohlc(symbol, openPrice, highPrice, lowPrice, averageTradedPrice, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            openPrice=excluded.openPrice,
            highPrice=excluded.highPrice,
            lowPrice=excluded.lowPrice,
            averageTradedPrice=excluded.averageTradedPrice,
            updatedAt=excluded.updatedAt`,
    args: [row.symbol, row.openPrice, row.highPrice, row.lowPrice, row.averageTradedPrice, Date.now()],
  }));

  await db.batch(statements, "write");
}

export async function getOhlcMap(): Promise<Map<string, OhlcRow>> {
  const result = await db.execute(
    "SELECT symbol, openPrice, highPrice, lowPrice, averageTradedPrice FROM live_ohlc",
  );
  return new Map(
    result.rows.map((row) => [
      String(row.symbol),
      {
        symbol: String(row.symbol),
        openPrice: Number(row.openPrice),
        highPrice: Number(row.highPrice),
        lowPrice: Number(row.lowPrice),
        averageTradedPrice: Number(row.averageTradedPrice),
      },
    ]),
  );
}

// ─── Stock search table ────────────────────────────────────────────────────
export type StockRow = {
  symbol: string;
  name: string;
  lastTradedPrice: number;
  percentageChange: number;
  totalTradeQuantity: number;
};

export async function saveStocks(stocks: StockRow[]): Promise<void> {
  if (!stocks.length) return;
  const now = Date.now();
  const statements = stocks.map((s) => ({
    sql: `INSERT INTO stocks(symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            name=excluded.name,
            lastTradedPrice=excluded.lastTradedPrice,
            percentageChange=excluded.percentageChange,
            totalTradeQuantity=excluded.totalTradeQuantity,
            updatedAt=excluded.updatedAt`,
    args: [s.symbol, s.name, s.lastTradedPrice, s.percentageChange, s.totalTradeQuantity, now],
  }));
  await db.batch(statements, "write");
}

export async function searchStocks(q: string): Promise<StockRow[]> {
  const query = `%${q}%`;
  const result = await db.execute({
    sql: "SELECT symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY symbol LIMIT 50",
    args: [query, query],
  });
  return result.rows.map((r) => ({
    symbol: String(r.symbol),
    name: String(r.name),
    lastTradedPrice: Number(r.lastTradedPrice),
    percentageChange: Number(r.percentageChange),
    totalTradeQuantity: Number(r.totalTradeQuantity),
  }));
}

export async function getAllStocks(): Promise<StockRow[]> {
  const result = await db.execute(
    "SELECT symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity FROM stocks ORDER BY symbol",
  );
  return result.rows.map((r) => ({
    symbol: String(r.symbol),
    name: String(r.name),
    lastTradedPrice: Number(r.lastTradedPrice),
    percentageChange: Number(r.percentageChange),
    totalTradeQuantity: Number(r.totalTradeQuantity),
  }));
}

// ─── Floorsheet trades (DB-backed) ────────────────────────────────────────
export type FsTrade = {
  tradeDate: string;
  stockSymbol: string;
  securityName: string;
  buyerMemberId: string;
  sellerMemberId: string;
  contractQuantity: number;
  contractAmount: number;
  tradeOrder?: number;
};

export async function saveFloorsheetTrades(date: string, trades: FsTrade[]): Promise<void> {
  if (!trades.length) return;
  const now = Date.now();
  // Delete existing trades + agg for this date and re-insert
  await db.execute("DELETE FROM floorsheet_trades WHERE tradeDate = ?", [date]);
  await db.execute("DELETE FROM broker_daily_agg WHERE tradeDate = ?", [date]);
  // Batch insert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < trades.length; i += CHUNK) {
    const chunk = trades.slice(i, i + CHUNK);
    const statements = chunk.map((t, idx) => ({
      sql: `INSERT INTO floorsheet_trades(tradeDate, stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount, tradeOrder, syncedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [t.tradeDate, t.stockSymbol, t.securityName, t.buyerMemberId, t.sellerMemberId, t.contractQuantity, t.contractAmount, t.tradeOrder ?? (i + idx), now],
    }));
    await db.batch(statements, "write");
  }
}

// Save broker daily aggregation
export async function saveBrokerDailyAgg(date: string, aggs: Array<{ tradeDate: string; stockSymbol: string; brokerId: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number }>): Promise<void> {
  if (!aggs.length) return;
  await db.execute("DELETE FROM broker_daily_agg WHERE tradeDate = ?", [date]);
  const CHUNK = 500;
  for (let i = 0; i < aggs.length; i += CHUNK) {
    const chunk = aggs.slice(i, i + CHUNK);
    const statements = chunk.map((a) => ({
      sql: `INSERT INTO broker_daily_agg(tradeDate, stockSymbol, brokerId, buyQty, buyAmt, sellQty, sellAmt, netQty, netAmt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [a.tradeDate, a.stockSymbol, a.brokerId, a.buyQty, a.buyAmt, a.sellQty, a.sellAmt, a.netQty, a.netAmt],
    }));
    await db.batch(statements, "write");
  }
}

// Save daily OHLCV
export async function saveDailyOhlcv(date: string, rows: Array<{ symbol: string; open: number; high: number; low: number; close: number; volume: number; value: number }>): Promise<void> {
  if (!rows.length) return;
  const statements = rows.map((r) => ({
    sql: `INSERT INTO stock_daily_ohlcv(tradeDate, symbol, open, high, low, close, volume, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tradeDate, symbol) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, value=excluded.value`,
    args: [date, r.symbol, r.open, r.high, r.low, r.close, r.volume, r.value],
  }));
  await db.batch(statements, "write");
}

// Save OHLCV from MeroLagani turnover data (has O/H/L/C/Q)
export async function syncMeroOhlcv(date: string, turnover: Array<{ s: string; op: number; h: number; l: number; lp: number; q: number; t: number }>): Promise<number> {
  if (!turnover.length || !date) return 0;
  const rows = turnover
    .filter((t) => t.op > 0 && t.lp > 0)
    .map((t) => ({
      symbol: t.s,
      open: t.op,
      high: t.h,
      low: t.l,
      close: t.lp,
      volume: t.q,
      value: t.t,
    }));
  if (!rows.length) return 0;
  await saveDailyOhlcv(date, rows);
  return rows.length;
}

export async function getFloorsheetCount(date: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM floorsheet_trades WHERE tradeDate = ?", args: [date] });
  return Number(r.rows[0]?.cnt ?? 0);
}

export async function getAvailableDates(): Promise<string[]> {
  const r = await db.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate DESC LIMIT 30");
  return r.rows.map((row) => String(row.tradeDate));
}

// ─── OHLCV candles from DB for signal generation ─────────────────────────
export type OhlcvCandle = {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function getCandlesFromDb(symbol: string, limit = 300): Promise<OhlcvCandle[]> {
  const r = await db.execute({
    sql: "SELECT tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT ?",
    args: [symbol, limit],
  });
  return r.rows
    .map((row) => ({
      tradeDate: String(row.tradeDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .reverse(); // oldest first
}

// ─── Broker flow from DB (broker_daily_agg) ──────────────────────────────
export type BrokerFlowRow = {
  stockSymbol: string;
  buyerId: string;
  buyerNet: number;
  sellerId: string;
  sellerNet: number;
  bias: "accumulate" | "distribute" | "neutral";
};

export async function getBrokerFlowFromDb(date?: string): Promise<Map<string, BrokerFlowRow>> {
  const targetDate = date ?? (await db.execute(
    "SELECT MAX(tradeDate) as d FROM broker_daily_agg"
  )).rows[0]?.d;
  if (!targetDate) return new Map();

  const r = await db.execute({
    sql: `SELECT stockSymbol, brokerId,
          SUM(buyQty) as buyQty, SUM(sellQty) as sellQty
          FROM broker_daily_agg
          WHERE tradeDate = ?
          GROUP BY stockSymbol, brokerId`,
    args: [String(targetDate)],
  });

  const byStock = new Map<string, Map<string, { buy: number; sell: number }>>();
  for (const row of r.rows) {
    const sym = String(row.stockSymbol);
    const broker = String(row.brokerId);
    const buy = Number(row.buyQty);
    const sell = Number(row.sellQty);
    const m = byStock.get(sym) ?? new Map();
    const prev = m.get(broker) ?? { buy: 0, sell: 0 };
    m.set(broker, { buy: prev.buy + buy, sell: prev.sell + sell });
    byStock.set(sym, m);
  }

  const out = new Map<string, BrokerFlowRow>();
  for (const [symbol, brokers] of byStock) {
    let buyerId = "", buyerNet = -Infinity, sellerId = "", sellerNet = Infinity;
    for (const [id, { buy, sell }] of brokers) {
      const net = buy - sell;
      if (net > buyerNet) { buyerNet = net; buyerId = id; }
      if (net < sellerNet) { sellerNet = net; sellerId = id; }
    }
    const bias = buyerNet > -sellerNet * 1.2 ? "accumulate"
      : -sellerNet > buyerNet * 1.2 ? "distribute" : "neutral";
    out.set(symbol, {
      stockSymbol: symbol,
      buyerId, buyerNet: Math.round(buyerNet),
      sellerId, sellerNet: Math.round(sellerNet),
      bias,
    });
  }
  return out;
}
