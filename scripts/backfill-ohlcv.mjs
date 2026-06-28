#!/usr/bin/env node
/**
 * Backfill OHLCV data from NEPSE price history API
 * Fetches 300 days of daily price/volume history per stock into stock_daily_ohlcv
 * 
 * Run: node scripts/backfill-ohlcv.mjs
 */
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "darisir.db");

const db = createClient({ url: `file:${dbPath}` });

const CONCURRENCY = 4;
const NEPSE_BASE = "https://www.nepalstock.com.np";

// Simple fetch wrapper with retry
async function fetchJson(url, options = {}) {
  const { retries = 2, timeout = 15000 } = options;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { signal: ctrl.signal, ...options });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// Get security list from NEPSE
async function getSecurityList() {
  // Try local DB first
  const local = await db.execute("SELECT symbol FROM stocks ORDER BY symbol");
  if (local.rows.length > 500) {
    console.log(`Found ${local.rows.length} stocks in local DB`);
    return local.rows.map(r => String(r.symbol));
  }
  
  // Fallback: fetch from NEPSE
  const data = await fetchJson(`${NEPSE_BASE}/api/nots/security?nonDelisted=true`, {
    headers: { "Accept": "application/json" }
  });
  return data.map(s => s.symbol);
}

// Get security ID for a symbol
async function getSecurityIds(symbols) {
  try {
    const data = await fetchJson(`${NEPSE_BASE}/api/nots/security?nonDelisted=true`, {
      headers: { "Accept": "application/json" }
    });
    const map = new Map();
    data.forEach(s => map.set(s.symbol, s.id));
    return map;
  } catch {
    return new Map();
  }
}

// Fetch price history for a security ID
async function fetchPriceHistory(symbol, securityId) {
  const url = `${NEPSE_BASE}/api/nots/market/security/price/${securityId}?size=300&page=0`;
  const data = await fetchJson(url, { timeout: 20000, retries: 2 });
  if (!Array.isArray(data)) return [];
  
  return data.map(item => ({
    tradeDate: String(item.businessDate).split("T")[0] || String(item.date),
    symbol: symbol,
    open: Number(item.openPrice) || 0,
    high: Number(item.highPrice) || 0,
    low: Number(item.lowPrice) || 0,
    close: Number(item.closePrice) || 0,
    volume: Number(item.totalTradeQuantity) || Number(item.volume) || 0,
  }));
}

async function main() {
  console.log("=== OHLCV Backfill from NEPSE ===\n");
  
  // Get symbols
  const symbols = await getSecurityList();
  console.log(`Total symbols: ${symbols.length}`);
  
  // Check current coverage
  const existingCount = await db.execute("SELECT COUNT(*) as c FROM stock_daily_ohlcv");
  console.log(`Existing OHLCV rows: ${existingCount.rows[0].c}`);
  
  const existingDates = await db.execute(
    "SELECT DISTINCT tradeDate FROM stock_daily_ohlcv ORDER BY tradeDate"
  );
  console.log(`Existing dates: ${existingDates.rows.map(r => r.tradeDate).join(", ")}`);
  
  // Get security ID map
  const idMap = await getSecurityIds(symbols);
  console.log(`Resolved ${idMap.size} security IDs`);
  
  // Find symbols missing IDs
  const missingIds = symbols.filter(s => !idMap.has(s));
  if (missingIds.length > 0) {
    console.log(`Symbols without IDs (trying local DB stock ID): ${missingIds.length}`);
  }
  
  // Fetch price history in batches
  const symbolList = symbols.filter(s => idMap.has(s));
  console.log(`\nFetching price history for ${symbolList.length} symbols (${CONCURRENCY} concurrent)...`);
  
  let fetched = 0;
  let errors = 0;
  let totalRows = 0;
  let skipped = 0;
  
  for (let i = 0; i < symbolList.length; i += CONCURRENCY) {
    const batch = symbolList.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(sym => fetchPriceHistory(sym, idMap.get(sym)))
    );
    
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.length > 0) {
        const rows = result.value;
        
        // Insert/update each row
        let inserted = 0;
        for (const row of rows) {
          if (!row.tradeDate || row.tradeDate.length < 10) continue;
          try {
            const existing = await db.execute({
              sql: "SELECT COUNT(*) as c FROM stock_daily_ohlcv WHERE tradeDate = ? AND symbol = ?",
              args: [row.tradeDate, row.symbol],
            });
            if (existing.rows[0].c === 0) {
              await db.execute({
                sql: `INSERT INTO stock_daily_ohlcv (tradeDate, symbol, open, high, low, close, volume)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [row.tradeDate, row.symbol, row.open, row.high, row.low, row.close, row.volume],
              });
              inserted++;
            }
          } catch (e) {
            // Skip duplicate rows silently
          }
        }
        
        fetched++;
        totalRows += inserted;
        if (inserted === 0) skipped++;
        
        if (fetched % 20 === 0 || fetched === symbolList.length) {
          const pct = ((fetched / symbolList.length) * 100).toFixed(1);
          console.log(`  [${pct}%] ${fetched}/${symbolList.length} stocks, ${totalRows} new OHLCV rows inserted`);
        }
      } else {
        errors++;
      }
    }
    
    // Small delay to avoid rate limiting
    if (i + CONCURRENCY < symbolList.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`\n=== Complete ===`);
  console.log(`  Stocks processed: ${fetched}`);
  console.log(`  New OHLCV rows: ${totalRows}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Skipped (already had data): ${skipped}`);
  
  const finalCount = await db.execute("SELECT COUNT(*) as c FROM stock_daily_ohlcv");
  console.log(`  Total OHLCV rows: ${finalCount.rows[0].c}`);
  
  const dateCounts = await db.execute(
    "SELECT tradeDate, COUNT(*) as cnt FROM stock_daily_ohlcv GROUP BY tradeDate ORDER BY tradeDate"
  );
  console.log(`\n  Dates: ${dateCounts.rows.length}`);
  dateCounts.rows.forEach(r => console.log(`    ${r.tradeDate}: ${r.cnt} stocks`));
  
  const maxDays = await db.execute(
    "SELECT MAX(c) as m FROM (SELECT COUNT(*) as c FROM stock_daily_ohlcv GROUP BY symbol)"
  );
  console.log(`\n  Max days per stock: ${maxDays.rows[0].m}`);
  
  await db.close();
}

main().catch(console.error);
