/**
 * Seed & auto-update broker history from MeroLagani (Node.js version).
 *
 * Usage:
 *   node scripts/seed-broker-history.mjs               # save today
 *   node scripts/seed-broker-history.mjs --date 2026-06-22  # specific date
 *   node scripts/seed-broker-history.mjs --daily       # daily cron mode
 *
 * Uses better-sqlite3 (already in dependencies) to write directly to DB.
 * Node.js fetch() works in this environment (Python/curl time out).
 */
import { createRequire } from "node:module";
import { existsSync, cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const BASE = process.cwd();
const DB_PATHS = [
  join(BASE, "seed", "darisir.db"),
  join(BASE, "data", "darisir.db"),
];

const MERO_URL = "https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary";
const MERO_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: "https://merolagani.com/MarketSummary.aspx",
};

function todayNpt() {
  const d = new Date();
  const s = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  return s;
}

async function fetchMero() {
  const res = await fetch(MERO_URL, { headers: MERO_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function ensureDb(dbPath) {
  if (!existsSync(dbPath)) {
    const dir = join(dbPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Copy from seed if exists
    const seedPath = join(BASE, "seed", "darisir.db");
    if (existsSync(seedPath)) {
      cpSync(seedPath, dbPath);
    } else {
      throw new Error(`No existing DB found at ${seedPath}`);
    }
  }
  return dbPath;
}

function saveBrokerData(date, brokers, dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const now = Date.now();
  const raw = JSON.stringify(brokers.sort((a, b) => (a.b || "").localeCompare(b.b || "")));
  const { createHash } = require("node:crypto");
  const dataHash = createHash("md5").update(raw).digest("hex").slice(0, 12);

  const stmt = db.prepare(`
    INSERT INTO merolagani_broker_daily (tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tradeDate, brokerCode) DO UPDATE SET
      brokerName = excluded.brokerName,
      purchaseAmt = excluded.purchaseAmt,
      sellAmt = excluded.sellAmt,
      netAmt = excluded.netAmt,
      totalAmt = excluded.totalAmt,
      savedAt = excluded.savedAt,
      hash = excluded.hash
  `);

  const tx = db.transaction(() => {
    let saved = 0;
    for (const b of brokers) {
      const code = b.b;
      if (!code) continue;
      stmt.run(
        date, code, b.n || "",
        Number(b.p) || 0, Number(b.s) || 0,
        Number(b.m) || 0, Number(b.t) || 0,
        now, dataHash,
      );
      saved++;
    }
    return saved;
  });

  const result = tx();
  db.close();
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf("--date");
  const date = dateIdx >= 0 ? args[dateIdx + 1] : todayNpt();
  const isDaily = args.includes("--daily");

  if (!date) {
    console.error("Usage: node scripts/seed-broker-history.mjs [--date YYYY-MM-DD] [--daily]");
    process.exit(1);
  }

  console.log(`Fetching MeroLagani data for ${date}...`);
  const mero = await fetchMero();
  const mt = mero.mt ?? "?";
  const stockCount = mero.stock?.detail?.length ?? 0;
  const brokers = mero.broker?.detail ?? [];

  if (!brokers.length) {
    console.error(`ERROR: No broker data in MeroLagani response (market: ${mt}, stocks: ${stockCount})`);
    process.exit(1);
  }

  console.log(`  Market: ${mt} | Stocks: ${stockCount} | Brokers: ${brokers.length}`);

  let totalSaved = 0;
  for (const dbPath of DB_PATHS) {
    try {
      ensureDb(dbPath);
      const saved = saveBrokerData(date, brokers, dbPath);
      totalSaved += saved;
      console.log(`  Saved ${saved} brokers to ${dbPath}`);
    } catch (e) {
      console.error(`  ERROR saving to ${dbPath}: ${e.message}`);
    }
  }

  console.log(`\nDone. Total broker records saved: ${totalSaved}`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
