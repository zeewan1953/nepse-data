import { open } from "sqlite";
import sqlite3 from "sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.join(process.cwd(), "data", "darisir.db");
const db = await open({ filename: dbPath, driver: sqlite3.Database });

console.log("=== Database File ===");
const stat = fs.statSync(dbPath);
console.log(`Path: ${dbPath}`);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

console.log("\n=== Tables ===");
const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
for (const t of tables) console.log(`- ${t.name}`);

const important = ["floorsheet_trades", "broker_daily_agg", "merolagani_broker_daily", "stocks", "stock_daily_ohlcv", "sync_logs", "error_logs"];
for (const table of important) {
  try {
    const c = await db.get(`SELECT COUNT(*) as count FROM "${table}"`);
    console.log(`\n${table}: ${c.count} rows`);
  } catch (e) {
    console.log(`\n${table}: ERROR - ${(e as Error).message}`);
  }
}

console.log("\n=== Floorsheet by Date (most recent 10) ===");
try {
  const rows = await db.all(`SELECT tradeDate, COUNT(*) as cnt, MIN(tradeOrder), MAX(tradeOrder)
    FROM floorsheet_trades GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 10`);
  for (const r of rows) console.log(`  ${r.tradeDate}: ${r.cnt} trades (orders ${r['MIN(tradeOrder)']}–${r['MAX(tradeOrder)']})`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

console.log("\n=== Broker Daily Agg by Date (most recent 10) ===");
try {
  const rows = await db.all(`SELECT tradeDate, COUNT(*) as cnt, SUM(buyAmt) as buyAmt, SUM(sellAmt) as sellAmt
    FROM broker_daily_agg GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 10`);
  for (const r of rows) console.log(`  ${r.tradeDate}: ${r.cnt} rows | Buy: ${Number(r.buyAmt).toFixed(0)} | Sell: ${Number(r.sellAmt).toFixed(0)}`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

console.log("\n=== MeroLagani Broker Daily by Date (most recent 10) ===");
try {
  const rows = await db.all(`SELECT tradeDate, COUNT(*) as cnt, SUM(purchaseAmt) as buy, SUM(sellAmt) as sell
    FROM merolagani_broker_daily GROUP BY tradeDate ORDER BY tradeDate DESC LIMIT 10`);
  for (const r of rows) console.log(`  ${r.tradeDate}: ${r.cnt} brokers | Buy: ${Number(r.buy).toFixed(0)} | Sell: ${Number(r.sell).toFixed(0)}`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

console.log("\n=== Stocks Table (count) ===");
try {
  const c = await db.get(`SELECT COUNT(*) as count FROM stocks`);
  console.log(`  stocks: ${c.count} symbols`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

console.log("\n=== Recent Sync Logs (most recent 5) ===");
try {
  const rows = await db.all(`SELECT ts, attempt, phase, status, detail FROM sync_logs ORDER BY id DESC LIMIT 5`);
  for (const r of rows) console.log(`  [${new Date(r.ts).toISOString()}] attempt=${r.attempt} phase=${r.phase} status=${r.status} detail=${r.detail}`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

console.log("\n=== Recent Error Logs (most recent 5) ===");
try {
  const rows = await db.all(`SELECT ts, source, severity, message FROM error_logs ORDER BY id DESC LIMIT 5`);
  for (const r of rows) console.log(`  [${new Date(r.ts).toISOString()}] [${r.severity}] ${r.source}: ${r.message}`);
} catch (e) {
  console.log("  Error:", (e as Error).message);
}

await db.close();
