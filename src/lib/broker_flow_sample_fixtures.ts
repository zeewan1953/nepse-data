/**
 * Sample/Demo data generator for Broker Flow Analytics.
 * 
 * ⚠️  FOR DEMO ONLY — replace with real data fetching in production.
 * 
 * Exports the same interface the real data module will expose:
 *   getOHLCVHistory(symbol, days) → OHLCVBar[]  (ascending by date)
 *   getFloorsheetRows(date)       → FloorsheetRow[]
 */

import type { OHLCVBar, FloorsheetRow } from "./broker_flow_analytics";

// Bump this when generation logic changes → invalidates all cached data
export const DATA_VERSION = "v6";

// ─── Seeded random for reproducibility ───────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function hashSymbol(symbol: string): number {
  return symbol.split("").reduce((s, c) => s + c.charCodeAt(0) * 31, 0);
}

// ─── Dynamic stock config from any symbol ─────────────────────────────────────

function getStockConfig(symbol: string): { base: number; volatility: number } {
  const h = hashSymbol(symbol);
  const rng = seededRandom(h);
  // Base price between 100-1200
  const base = Math.round(100 + rng() * 1100);
  // Volatility between 1.5%-5%
  const volatility = 0.015 + rng() * 0.035;
  return { base, volatility };
}

// ─── Core stock universe (most traded NEPSE stocks) ──────────────────────────

const CORE_STOCKS = [
  "NABIL", "NICA", "SCB", "NMB", "EBL", "SBL", "GBIME", "PCBL", "NLG", "SANIMA",
  "HIDCL", "CHCL", "UPPER", "BPCL", "NRN", "API", "NHPC", "SHINE", "AKJCL", "AKPL",
  "ADBL", "NWC", "SALICO", "MKHC", "MKCL", "HDL", "LICN", "NIL", "NRIC", "SIFC",
  "CIT", "NIMB", "PCL", "SPDL", "JBCL", "IGI", "ALICL", "AHPC", "SWMF", "BARUN",
];

const BROKERS = Array.from({ length: 101 }, (_, i) => i + 1); // broker IDs 1..101 (all NEPSE brokers)

// Track extra symbols requested dynamically (e.g., user searched "API")
const extraSymbols = new Set<string>();

function getAllSymbols(): string[] {
  const all = new Set(CORE_STOCKS);
  for (const s of extraSymbols) all.add(s);
  return [...all];
}

// ─── Generate OHLCV bars ─────────────────────────────────────────────────────

function generateOHLCV(symbol: string, basePrice: number, volatility: number, days: number): OHLCVBar[] {
  const rng = seededRandom(hashSymbol(symbol) + 1000);
  const bars: OHLCVBar[] = [];
  let price = basePrice;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const change = (rng() - 0.5) * 2 * volatility;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + rng() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - rng() * volatility * 0.5);
    const volume = Math.round((500000 + rng() * 2000000) * (1 + Math.abs(change) * 10));

    bars.push({
      date: date.toISOString().split("T")[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return bars;
}

// ─── Generate floorsheet rows ────────────────────────────────────────────────

function generateFloorsheet(date: string): FloorsheetRow[] {
  const dateSeed = date.split("-").reduce((s, v) => s + parseInt(v), 0);
  const rng = seededRandom(dateSeed + 7);
  const rows: FloorsheetRow[] = [];
  const symbols = getAllSymbols();

  for (const sym of symbols) {
    const config = getStockConfig(sym);
    const symHash = hashSymbol(sym);

    // Use SYMBOL-based seed for broker pool → same brokers active per stock across days
    const poolRng = seededRandom(symHash + 999);
    // Use DATE+SYMBOL seed for trade-level randomness → varies per day
    const tradeRng = seededRandom(dateSeed + symHash);

    // Each stock gets 100-180 trades (enough for brokers to appear on BOTH sides)
    const tradeCount = Math.round(100 + tradeRng() * 80);
    const drift = (tradeRng() - 0.5) * 0.04;
    let price = config.base;

    // Select 15-22 active brokers for this stock (consistent pool across days)
    const activeCount = Math.round(15 + poolRng() * 8);
    const activeBrokers: number[] = [];
    const used = new Set<number>();
    // Mix of smart money (1-20) and regular brokers (21-101)
    const smartCount = Math.round(5 + poolRng() * 6); // 5-11 smart money brokers
    for (let i = 0; i < smartCount && activeBrokers.length < activeCount; i++) {
      const b = BROKERS[Math.floor(poolRng() * 20)];
      if (!used.has(b)) { activeBrokers.push(b); used.add(b); }
    }
    while (activeBrokers.length < activeCount) {
      const b = BROKERS[20 + Math.floor(poolRng() * 81)];
      if (!used.has(b)) { activeBrokers.push(b); used.add(b); }
    }

    for (let t = 0; t < tradeCount; t++) {
      const hour = 11 + Math.floor((t / tradeCount) * 4);
      const minute = Math.floor(tradeRng() * 60);
      const second = Math.floor(tradeRng() * 60);
      const timestamp = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;

      price = price * (1 + (tradeRng() - 0.48) * config.volatility * 0.3 + drift * 0.01);
      const qty = Math.round(50 + tradeRng() * 500);

      // Pick buyer and seller from active brokers (same pool → both sides guaranteed over 5 days)
      const buyerIdx = Math.floor(tradeRng() * activeBrokers.length);
      let sellerIdx = Math.floor(tradeRng() * activeBrokers.length);
      if (sellerIdx === buyerIdx) sellerIdx = (sellerIdx + 1) % activeBrokers.length;

      rows.push({
        timestamp,
        symbol: sym,
        qty,
        price: Math.round(price * 100) / 100,
        buyerBrokerId: activeBrokers[buyerIdx],
        sellerBrokerId: activeBrokers[sellerIdx],
      });
    }
  }

  return rows;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getOHLCVHistory(symbol: string, days: number): OHLCVBar[] {
  const config = getStockConfig(symbol);
  return generateOHLCV(symbol, config.base, config.volatility, days);
}

export function getFloorsheetRows(date: string): FloorsheetRow[] {
  return generateFloorsheet(date);
}

/**
 * Register a symbol so it gets included in floorsheet generation.
 * Call this when user searches a stock in the UI.
 */
export function registerSymbol(symbol: string): void {
  const upper = symbol.toUpperCase();
  if (!CORE_STOCKS.includes(upper)) {
    extraSymbols.add(upper);
  }
}

/**
 * Get all available stock symbols (core + dynamically registered)
 */
export function getStockSymbols(): string[] {
  return getAllSymbols();
}

/**
 * Get multiple days of floorsheet data
 */
export function getMultiDayFloorsheets(dayCount: number): Array<{ date: string; rows: FloorsheetRow[] }> {
  const results: Array<{ date: string; rows: FloorsheetRow[] }> = [];
  const today = new Date();

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = d.toISOString().split("T")[0];
    results.push({ date: dateStr, rows: generateFloorsheet(dateStr) });
  }

  return results;
}
