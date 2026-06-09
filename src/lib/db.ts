import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Local SQLite store. NEPSE API data is synced into here; the app reads from
// SQL so pages render instantly even when the upstream site is slow/blocking.
declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function open(): Database.Database {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "darisir.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_market (
      symbol TEXT PRIMARY KEY,
      securityId TEXT,
      securityName TEXT,
      indexId INTEGER,
      openPrice REAL,
      highPrice REAL,
      lowPrice REAL,
      lastTradedPrice REAL,
      previousClose REAL,
      percentageChange REAL,
      totalTradeQuantity REAL,
      totalTradeValue REAL,
      lastTradedVolume REAL,
      averageTradedPrice REAL,
      lastUpdatedDateTime TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      mobile TEXT,
      name TEXT,
      passwordHash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otps (
      email TEXT PRIMARY KEY,
      codeHash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__db) globalThis.__db = open();
  return globalThis.__db;
}

type Ohlc = { openPrice: number; highPrice: number; lowPrice: number; averageTradedPrice: number };

// Persist a live snapshot (only rows that actually have OHLC) so the market
// watch can show open/high/low after the market closes.
export function saveLiveSnapshot(
  rows: Array<{
    symbol: string;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    averageTradedPrice: number;
  }>,
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO live_market (symbol, openPrice, highPrice, lowPrice, averageTradedPrice)
    VALUES (@symbol, @openPrice, @highPrice, @lowPrice, @averageTradedPrice)
    ON CONFLICT(symbol) DO UPDATE SET
      openPrice=excluded.openPrice, highPrice=excluded.highPrice,
      lowPrice=excluded.lowPrice, averageTradedPrice=excluded.averageTradedPrice
  `);
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) {
      if (r.openPrice || r.highPrice || r.lowPrice) stmt.run(r);
    }
  });
  tx(rows);
}

// Map of symbol -> last captured OHLC.
export function getOhlcMap(): Map<string, Ohlc> {
  const rows = getDb()
    .prepare("SELECT symbol, openPrice, highPrice, lowPrice, averageTradedPrice FROM live_market")
    .all() as Array<{ symbol: string } & Ohlc>;
  const m = new Map<string, Ohlc>();
  for (const r of rows) m.set(r.symbol, r);
  return m;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, value);
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key=?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
