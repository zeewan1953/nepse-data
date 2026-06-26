/**
 * Scrapes price history from SamirWagle/Nepse-All-Scraper and computes
 * Relative Strength (3-month & 6-month returns + percentile rank).
 * Writes result to seed/relative_strength.json
 *
 * Usage: node scripts/scrape-relative-strength.mjs
 */
const PRICE_BASE = "https://raw.githubusercontent.com/SamirWagle/Nepse-All-Scraper/main/data/company-wise";

const now = new Date();
const date3m = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
const date6m = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return { date: cols[0], ltp: parseFloat(cols[4]) };
  }).filter((r) => !isNaN(r.ltp)).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const symbolsResp = await fetch("https://raw.githubusercontent.com/SamirWagle/Nepse-All-Scraper/main/data/company_list.json");
  const allSymbols = await symbolsResp.json();
  console.log(`Found ${allSymbols.length} symbols`);

  const rows = [];
  const batchSize = 10;

  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        try {
          const url = `${PRICE_BASE}/${symbol}/prices.csv`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return null;
          const prices = parseCSV(await res.text());
          if (prices.length < 20) return null;

          const latest = prices[prices.length - 1];
          const price3m = [...prices].reverse().find((p) => p.date <= date3m) || prices[0];
          const price6m = [...prices].reverse().find((p) => p.date <= date6m) || prices[0];
          if (!price3m || !price6m) return null;

          const ltp = latest.ltp;
          const return3m = price3m.ltp > 0 ? ((ltp - price3m.ltp) / price3m.ltp) * 100 : 0;
          const return6m = price6m.ltp > 0 ? ((ltp - price6m.ltp) / price6m.ltp) * 100 : 0;
          const avgTrend = (return3m + return6m) / 2;

          return { symbol, ltp, return3m, return6m, avgTrend };
        } catch { return null; }
      }),
    );
    let success = 0;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        rows.push(r.value);
        success++;
      }
    }
    console.log(`[${i + batch.length}/${allSymbols.length}] +${success} (${rows.length} total)`);
  }

  // Sort by avgTrend descending and assign percentile rank
  const sorted = [...rows].sort((a, b) => b.avgTrend - a.avgTrend);
  const nowISO = now.toISOString().slice(0, 10);
  const output = sorted.map((r, i) => ({
    ...r,
    company_name: "",
    sector: "",
    change_pct: 0,
    percentile_rank: rows.length > 0 ? ((rows.length - i) / rows.length) * 100 : 0,
    rank: i + 1,
    last_updated: nowISO,
  }));

  // Write to seed file
  const fs = await import("node:fs");
  const path = await import("node:path");
  const seedDir = path.join(process.cwd(), "seed");
  if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });
  const dest = path.join(seedDir, "relative_strength.json");
  fs.writeFileSync(dest, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} companies to ${dest}`);
}

main().catch(console.error);
