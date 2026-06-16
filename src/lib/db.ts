import "server-only";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import type { InArgs } from "@libsql/client";

// ─── Local SQLite (only for live OHLC market data) ──────────────────────
// Auth uses Supabase PostgreSQL — see src/lib/supabase.ts

let localDbUrl: string;

if (process.env.VERCEL === "1") {
  // On Vercel: use in-memory SQLite for ephemeral market data
  localDbUrl = ":memory:";
} else {
  // Local development: ensure data directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  localDbUrl = pathToFileURL(path.join(dataDir, "darisir.db")).href;
}

export const db = createClient({
  url: localDbUrl,
});

type SqlArgs = InArgs;

type OhlcRow = {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  averageTradedPrice: number;
};

async function createOhlcTable(): Promise<void> {
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
}

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

export async function saveLiveSnapshot(live: Array<OhlcRow>): Promise<void> {
  if (!live.length) return;
  await createOhlcTable();

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
  await createOhlcTable();
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
