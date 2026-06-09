import "server-only";
import { createClient, type Client, type InArgs } from "@libsql/client";

// libSQL store (Turso in production, a local file in dev). NEPSE API data is
// synced into here; the app reads from SQL so pages render instantly even when
// the upstream site is slow/blocking. Auth (users/otps/sessions) lives here too.
//
// In production set TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN.
// With no env set we fall back to a local SQLite file so dev works offline.
declare global {
  // eslint-disable-next-line no-var
  var __db: Client | undefined;
  // eslint-disable-next-line no-var
  var __dbInit: Promise<void> | undefined;
}

function client(): Client {
  if (!globalThis.__db) {
    const url = process.env.TURSO_DATABASE_URL || "file:data/darisir.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;
    globalThis.__db = createClient({ url, authToken });
  }
  return globalThis.__db;
}

// Create the schema once per process (cached as a promise so concurrent callers
// share a single round-trip).
function ensureSchema(db: Client): Promise<void> {
  if (!globalThis.__dbInit) {
    globalThis.__dbInit = db
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS live_market (
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
          )`,
          `CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            mobile TEXT,
            name TEXT,
            passwordHash TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            createdAt INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS otps (
            email TEXT PRIMARY KEY,
            codeHash TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expiresAt INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
          )`,
          `CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            expiresAt INTEGER NOT NULL
          )`,
        ],
        "write",
      )
      .then(() => undefined)
      .catch((e) => {
        // Reset so a transient failure (e.g. cold network) can be retried.
        globalThis.__dbInit = undefined;
        throw e;
      });
  }
  return globalThis.__dbInit;
}

export async function getDb(): Promise<Client> {
  const db = client();
  await ensureSchema(db);
  return db;
}

// Convenience helpers so call sites read like the old better-sqlite3 API.
export async function one<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const db = await getDb();
  const rs = await db.execute({ sql, args });
  return (rs.rows[0] as unknown as T) ?? undefined;
}

export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const db = await getDb();
  const rs = await db.execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function run(sql: string, args: InArgs = []): Promise<void> {
  const db = await getDb();
  await db.execute({ sql, args });
}

type Ohlc = { openPrice: number; highPrice: number; lowPrice: number; averageTradedPrice: number };

// Persist a live snapshot (only rows that actually have OHLC) so the market
// watch can show open/high/low after the market closes.
export async function saveLiveSnapshot(
  rows: Array<{
    symbol: string;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    averageTradedPrice: number;
  }>,
): Promise<void> {
  const db = await getDb();
  const stmts = rows
    .filter((r) => r.openPrice || r.highPrice || r.lowPrice)
    .map((r) => ({
      sql: `INSERT INTO live_market (symbol, openPrice, highPrice, lowPrice, averageTradedPrice)
            VALUES (:symbol, :openPrice, :highPrice, :lowPrice, :averageTradedPrice)
            ON CONFLICT(symbol) DO UPDATE SET
              openPrice=excluded.openPrice, highPrice=excluded.highPrice,
              lowPrice=excluded.lowPrice, averageTradedPrice=excluded.averageTradedPrice`,
      args: {
        symbol: r.symbol,
        openPrice: r.openPrice,
        highPrice: r.highPrice,
        lowPrice: r.lowPrice,
        averageTradedPrice: r.averageTradedPrice,
      } as InArgs,
    }));
  if (stmts.length) await db.batch(stmts, "write");
}

// Map of symbol -> last captured OHLC.
export async function getOhlcMap(): Promise<Map<string, Ohlc>> {
  const rows = await all<{ symbol: string } & Ohlc>(
    "SELECT symbol, openPrice, highPrice, lowPrice, averageTradedPrice FROM live_market",
  );
  const m = new Map<string, Ohlc>();
  for (const r of rows) m.set(r.symbol, r);
  return m;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await run("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [
    key,
    value,
  ]);
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await one<{ value: string }>("SELECT value FROM meta WHERE key=?", [key]);
  return row?.value ?? null;
}
