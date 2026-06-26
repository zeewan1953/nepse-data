"use server";

export type RelativeStrengthRow = {
  symbol: string;
  company_name: string;
  sector: string;
  ltp: number;
  change_pct: number;
  return3m: number;
  return6m: number;
  avgTrend: number;
  percentile_rank: number;
  rank: number;
  last_updated: string;
};

const PRICE_BASE = "https://raw.githubusercontent.com/SamirWagle/Nepse-All-Scraper/main/data/company-wise";

function parseCSV(csv: string): { date: string; ltp: number }[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return { date: cols[0], ltp: parseFloat(cols[4]) };
  }).filter((r) => !isNaN(r.ltp)).sort((a, b) => a.date.localeCompare(b.date));
}

export async function computeRelativeStrength(): Promise<RelativeStrengthRow[]> {
  const now = new Date();
  const date3m = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const date6m = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);

  const symbolsResp = await fetch("https://raw.githubusercontent.com/SamirWagle/Nepse-All-Scraper/main/data/company_list.json");
  const allSymbols: string[] = await symbolsResp.json();

  const rows: RelativeStrengthRow[] = [];
  const batchSize = 10;

  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
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
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        rows.push({
          ...r.value,
          company_name: "",
          sector: "",
          change_pct: 0,
          percentile_rank: 0,
          rank: 0,
          last_updated: now.toISOString().slice(0, 10),
        });
      }
    }
  }

  // Compute percentile rank
  const sorted = [...rows].sort((a, b) => b.avgTrend - a.avgTrend);
  sorted.forEach((r, i) => {
    r.rank = i + 1;
    r.percentile_rank = rows.length > 0 ? ((rows.length - i) / rows.length) * 100 : 0;
  });

  return sorted.sort((a, b) => b.avgTrend - a.avgTrend);
}

let _rsSeed: RelativeStrengthRow[] | null = null;

function loadSeed(): RelativeStrengthRow[] {
  if (_rsSeed) return _rsSeed;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const seedPath = path.join(process.cwd(), "seed", "relative_strength.json");
    if (fs.existsSync(seedPath)) {
      _rsSeed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as RelativeStrengthRow[];
      return _rsSeed;
    }
  } catch {}
  return [];
}

export async function getRelativeStrengthFromSeed(): Promise<RelativeStrengthRow[]> {
  return loadSeed().slice(0, 20);
}
