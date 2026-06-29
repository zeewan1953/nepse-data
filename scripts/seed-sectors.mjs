#!/usr/bin/env node
/**
 * Seed stock_sector_mapping from MeroLagani Company Detail pages.
 * Usage: node scripts/seed-sectors.mjs
 */
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "darisir.db");
const SEED_DB_PATH = path.join(__dirname, "..", "seed", "darisir.db");
const CONCURRENCY = 6;
const TIMEOUT = 20000;

const db = createClient({ url: `file:${DB_PATH}` });
const seedDb = createClient({ url: `file:${SEED_DB_PATH}` });

async function fetchSector(symbol) {
  const url = `https://eng.merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });
    if (!res.ok) return { symbol, sector: null, error: `HTTP ${res.status}` };
    const html = await res.text();

    // Extract sector from main table: <th>Sector</th><td>VALUE</td>
    let sector = null;
    const fullMatch = html.match(/<th[^>]*>\s*Sector[\s\S]*?<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (fullMatch?.[1]) {
      sector = fullMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    // Fallback: About tab sector
    if (!sector) {
      const aboutMatch = html.match(/<span title="Sector">[\s\S]*?<\/span><\/th>\s*<td>([^<]+)<\/td>/i);
      if (aboutMatch?.[1]) sector = aboutMatch[1].trim();
    }
    // Fallback: match from text
    if (!sector) {
      const textMatch = html.match(/Sector[^]*?<td[^>]*>([^<]+)/i);
      if (textMatch?.[1]) sector = textMatch[1].trim();
    }

    return { symbol, sector: sector || null, error: sector ? null : "no sector found" };
  } catch (e) {
    return { symbol, sector: null, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function seedSectors(client, label) {
  // Get all stocks
  // Ensure table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stock_sector_mapping (
      symbol TEXT PRIMARY KEY,
      sector TEXT NOT NULL,
      sub_sector TEXT,
      source_vendor TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const stocks = await client.execute("SELECT symbol FROM stocks ORDER BY symbol");
  console.log(`\n${label}: ${stocks.rows.length} stocks`);

  // Check which already have sector mapping
  const existing = await client.execute("SELECT symbol FROM stock_sector_mapping");
  const existingSet = new Set(existing.rows.map(r => String(r.symbol)));
  const todo = stocks.rows.filter(r => !existingSet.has(String(r.symbol)));
  console.log(`Already mapped: ${existingSet.size}, To fetch: ${todo.length}`);

  if (todo.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const now = Date.now();
  let done = 0;
  let errors = 0;

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(r => fetchSector(String(r.symbol)))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { symbol, sector, error } = result.value;
        if (sector) {
          await client.execute({
            sql: `INSERT OR REPLACE INTO stock_sector_mapping (symbol, sector, source_vendor, updated_at) VALUES (?, ?, ?, ?)`,
            args: [symbol, sector, "merolagani.com", now],
          });
          done++;
        } else {
          errors++;
          if (error) console.error(`  ${symbol}: ${error}`);
        }
      } else {
        errors++;
      }
    }

    const pct = (((i + batch.length) / todo.length) * 100).toFixed(1);
    if (done % 20 === 0 || i + batch.length >= todo.length) {
      console.log(`  [${pct}%] ${done} mapped, ${errors} errors`);
    }
  }

  console.log(`Done: ${done} sectors mapped, ${errors} errors`);
}

async function main() {
  console.log("=== Seed Stock-Sector Mapping from MeroLagani ===\n");
  await seedSectors(db, "data/darisir.db");
  await seedSectors(seedDb, "seed/darisir.db");
  await db.close();
  await seedDb.close();
  console.log("\nComplete.");
}

main().catch(console.error);
