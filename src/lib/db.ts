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
