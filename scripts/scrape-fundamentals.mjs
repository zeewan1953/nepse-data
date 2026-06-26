/**
 * Scrapes MeroLagani fundamental data for all NEPSE companies.
 * Writes result to seed/company_fundamentals.json for fast static reading.
 *
 * Usage: node scripts/scrape-fundamentals.mjs
 */
const BASE = "https://eng.merolagani.com";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function parseNumber(s) {
  const clean = String(s || "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function extractField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<th[^>]*>\\s*(?:<[^>]+>\\s*)*${escaped}[\\s\\S]*?<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "is"
  );
  const m = html.match(re);
  if (m?.[1]) {
    return m[1].replace(/<[^>]+>/g, "").trim().split(/[\r\n]+/)[0].trim();
  }
  return "";
}

function extractAboutField(html, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<span title="${escaped}">[^<]*<\\/span><\\/th>\\s*<td>([^<]+)<\\/td>`,
    "is"
  );
  const m = html.match(re);
  return m?.[1]?.trim() ?? "";
}

function extractName(html, symbol) {
  const aboutName = extractAboutField(html, "Company Name");
  if (aboutName) return aboutName;
  const titleMatch = html.match(new RegExp(`<title>([^<]*?)\\s*\\(${symbol}\\)`, "i"));
  if (titleMatch?.[1]) return titleMatch[1].trim().replace(/^merolagani\s*-\s*/i, "");
  const hMatch = html.match(new RegExp(`<h[2-4][^>]*>\\s*([^<]+?)\\s*\\(${symbol}\\)`, "i"));
  return hMatch?.[1]?.trim() ?? "";
}

function extractFieldFull(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<th[^>]*>\\s*${escaped}[\\s\\r\\n]*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "is"
  );
  const m = html.match(re);
  if (m?.[1]) {
    return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function parseDividends(html) {
  const items = [];
  const re = /<td class="text-center">\s*([\d.]+%)\s*<\/td>\s*<td class="text-center text-primary">\(FY:\s*([\d-]+)\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const val = parseFloat(m[1]);
    if (val > 0) items.push({ value: val, fiscalYear: m[2] });
  }
  return items;
}

async function scrapeOne(symbol) {
  const url = `${BASE}/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();

  const name = extractName(html, symbol);
  if (!name) return null;

  const sector = extractField(html, "Sector") || extractAboutField(html, "Sector");
  const sharesOutstanding = extractField(html, "Shares Outstanding");
  const eps = parseNumber(extractField(html, "EPS"));
  const pe = parseNumber(extractField(html, "P/E Ratio"));
  const bookValue = parseNumber(extractField(html, "Book Value"));
  const pbv = parseNumber(extractField(html, "PBV"));
  const marketCap = extractField(html, "Market Capitalization");
  const weekRange = extractField(html, "52 Weeks High - Low");
  const totalPaidup = extractAboutField(html, "Total Paidup Value");
  const dividends = parseDividends(html);
  const latestDividend = dividends[0]?.value ?? null;
  const today = new Date().toISOString().slice(0, 10);

  // Parse EPS quarter context: "33.34 (FY:082-083, Q:3)"
  const epsRaw = extractFieldFull(html, "EPS");
  const epsQMatch = epsRaw.match(/\(FY:([^,]+),\s*Q:(\d)\)/i);
  const epsFy = epsQMatch?.[1] ?? null;
  const epsQuarter = epsQMatch ? parseInt(epsQMatch[2], 10) : null;

  // Populate quarterly growth from current EPS if we know the quarter
  const q1 = epsQuarter === 1 ? eps : null;
  const q2 = epsQuarter === 2 ? eps : null;
  const q3 = epsQuarter === 3 ? eps : null;
  const q4 = epsQuarter === 4 ? eps : null;

  // NEW fields
  const lastTradedOn = extractField(html, "Last Traded On");
  const bonusPct = parseNumber(extractField(html, "% Bonus"));
  const rightSharePct = parseNumber(extractField(html, "Right Share"));
  const avg30Vol = parseNumber(extractField(html, "30-Day Avg Volume"));
  const marketPrice = parseNumber(extractField(html, "Market Price"));
  const changePct = parseNumber(extractField(html, "% Change"));
  const yearYield = parseNumber(extractField(html, "1 Year Yield"));
  const avg120 = parseNumber(extractField(html, "120 Day Average"));

  return {
    symbol, company_name: name, sector: sector || null,
    eps, pe_ratio: pe, paid_up_capital: parseNumber(totalPaidup),
    net_profit: null,
    q1_growth_pct: q1, q2_growth_pct: q2,
    q3_growth_pct: q3, q4_growth_pct: q4,
    book_value: bookValue,
    dividend_pct: latestDividend, market_cap: parseNumber(marketCap),
    shares_outstanding: parseNumber(sharesOutstanding), roe: null, pbv,
    debt_equity: null, fifty_two_week_range: weekRange || null,
    last_updated: today, source: "merolagani.com",
    bonus_pct: bonusPct, right_share_pct: rightSharePct,
    avg_30day_volume: avg30Vol, last_traded_on: lastTradedOn || null,
    market_price: marketPrice, change_pct: changePct,
    year_yield: yearYield, avg_120day: avg120,
    eps_fy: epsFy, eps_quarter: epsQuarter,
  };
}

async function main() {
  // Get all symbols from MeroLagani
  const summaryUrl = `${BASE}/handlers/webrequesthandler.ashx?type=market_summary`;
  const sumRes = await fetch(summaryUrl, { headers: { ...HEADERS, Accept: "application/json", Referer: "https://merolagani.com/MarketSummary.aspx" } });
  const summary = await sumRes.json();
  const symbols = (summary.turnover?.detail || []).map((s) => s.s);
  console.log(`Found ${symbols.length} symbols`);

  const results = [];
  const batchSize = 3;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const scraped = await Promise.allSettled(batch.map(scrapeOne));
    let successInBatch = 0;
    for (const r of scraped) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
        successInBatch++;
      }
    }
    console.log(`[${i + batch.length}/${symbols.length}] ${successInBatch} scraped (${results.length} total)`);
  }

  // Write to seed file
  const fs = await import("node:fs");
  const path = await import("node:path");
  const seedDir = path.join(process.cwd(), "seed");
  if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });
  const dest = path.join(seedDir, "company_fundamentals.json");
  fs.writeFileSync(dest, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} companies to ${dest}`);
}

main().catch(console.error);
