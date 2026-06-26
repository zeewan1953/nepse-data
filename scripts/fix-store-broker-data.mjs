/**
 * Fix & store broker data from MeroLagani.
 * - Fetches live MeroLagani broker summary
 * - Merges with ShareHub broker listing for clean names
 * - Saves to merolagani_broker_daily with hash
 * - Also saves JSON export for frontend
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const BASE = process.cwd();
const DB_PATH = join(BASE, "data", "darisir.db");
const SEED_DB_PATH = join(BASE, "seed", "darisir.db");
const DATA_DIR = join(BASE, "public", "data");

const MERO_URL = "https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary";
const SHAREHUB_BROKER_URL = "https://sharehubnepal.com/data/api/v1/broker?pageSize=100";

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://merolagani.com/MarketSummary.aspx",
};

function todayNpt() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

function makeHash(obj) {
  return createHash("md5").update(JSON.stringify(obj, Object.keys(obj).sort())).digest("hex").slice(0, 12);
}

async function fetchMeroLagani() {
  const res = await fetch(MERO_URL, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  return res.json();
}

async function fetchShareHubBrokers() {
  try {
    const brokers = {};
    let page = 1, totalPages = 1;
    while (page <= totalPages) {
      const res = await fetch(`https://sharehubnepal.com/data/api/v1/broker?page=${page}&pageSize=50`, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (data?.data?.content) {
        for (const b of data.data.content) {
          brokers[b.code] = b.name;
        }
        totalPages = data.data.totalPages || 1;
      }
      page++;
    }
    return brokers;
  } catch (e) {
    console.warn("ShareHub broker listing unavailable:", e.message);
    return {};
  }
}

function saveToDb(db, date, brokers, brokerNames) {
  const cols = db.prepare("PRAGMA table_info(merolagani_broker_daily)").all();
  const hasHash = cols.some(c => c.name === "hash");
  const hasQty = cols.some(c => c.name === "buyQty");

  const insertCols = hasHash
    ? "tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt, hash"
    : "tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt";
  const insertVals = hasHash ? "?, ?, ?, ?, ?, ?, ?, ?, ?" : "?, ?, ?, ?, ?, ?, ?, ?";
  const updateSet = hasHash
    ? "brokerName=excluded.brokerName, purchaseAmt=excluded.purchaseAmt, sellAmt=excluded.sellAmt, netAmt=excluded.netAmt, totalAmt=excluded.totalAmt, savedAt=excluded.savedAt, hash=excluded.hash"
    : "brokerName=excluded.brokerName, purchaseAmt=excluded.purchaseAmt, sellAmt=excluded.sellAmt, netAmt=excluded.netAmt, totalAmt=excluded.totalAmt, savedAt=excluded.savedAt";

  const stmt = db.prepare(
    `INSERT INTO merolagani_broker_daily (${insertCols}) VALUES (${insertVals}) ON CONFLICT(tradeDate, brokerCode) DO UPDATE SET ${updateSet}`
  );

  const tx = db.transaction(() => {
    let count = 0;
    for (const b of brokers) {
      const code = String(b.b);
      const name = brokerNames[code] || b.n || "";
      const netAmt = (Number(b.p) || 0) - (Number(b.s) || 0);
      const hash = makeHash({ code, name, p: b.p, s: b.s, netAmt, t: b.t });
      const vals = [date, code, name, Number(b.p) || 0, Number(b.s) || 0, netAmt, Number(b.t) || 0, Date.now()];
      if (hasHash) vals.push(hash);
      stmt.run(...vals);
      count++;
    }
    return count;
  });

  return tx();
}

function getDb(path) {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  return db;
}

async function main() {
  const date = process.argv.includes("--date")
    ? process.argv[process.argv.indexOf("--date") + 1]
    : todayNpt();

  console.log(`Fetching MeroLagani broker data for ${date}...`);
  const mero = await fetchMeroLagani();
  const brokers = mero.broker?.detail || [];

  if (!brokers.length) {
    console.error("No broker data from MeroLagani");
    process.exit(1);
  }

  console.log(`Got ${brokers.length} brokers from MeroLagani, market: ${mero.mt}`);

  // Get ShareHub broker names
  console.log("Fetching ShareHub broker listing for names...");
  const brokerNames = await fetchShareHubBrokers();
  console.log(`Got ${Object.keys(brokerNames).length} broker names from ShareHub`);

  // Save to data DB
  console.log("Saving to data/darisir.db...");
  const db1 = getDb(DB_PATH);
  const saved1 = saveToDb(db1, date, brokers, brokerNames);
  db1.close();
  console.log(`  Saved ${saved1} brokers`);

  // Also save to seed DB
  if (existsSync(SEED_DB_PATH)) {
    console.log("Saving to seed/darisir.db...");
    const db2 = getDb(SEED_DB_PATH);
    const saved2 = saveToDb(db2, date, brokers, brokerNames);
    db2.close();
    console.log(`  Saved ${saved2} brokers`);
  }

  // Export as JSON for frontend
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const exportData = brokers.map(b => ({
    brokerCode: String(b.b),
    brokerName: brokerNames[String(b.b)] || b.n || "",
    purchaseAmt: Number(b.p) || 0,
    sellAmt: Number(b.s) || 0,
    netAmt: (Number(b.p) || 0) - (Number(b.s) || 0),
    totalAmt: Number(b.t) || 0,
  }));

  const jsonPath = join(DATA_DIR, `broker-summary-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify({
    date,
    source: "merolagani",
    marketStatus: mero.mt,
    totalBrokers: brokers.length,
    totalTurnover: exportData.reduce((s, b) => s + b.totalAmt, 0),
    totalBuy: exportData.reduce((s, b) => s + b.purchaseAmt, 0),
    totalSell: exportData.reduce((s, b) => s + b.sellAmt, 0),
    brokers: exportData.sort((a, b) => b.totalAmt - a.totalAmt),
  }, null, 2));
  console.log(`JSON export: ${jsonPath}`);

  // Also save latest copy
  const latestPath = join(DATA_DIR, "broker-summary-latest.json");
  writeFileSync(latestPath, JSON.stringify({
    date,
    source: "merolagani",
    brokers: exportData.sort((a, b) => b.totalAmt - a.totalAmt),
  }, null, 2));
  console.log(`Latest JSON: ${latestPath}`);

  console.log("\nDone!");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
