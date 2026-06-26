import { db } from "./db";

// ============ Scraped types ============

export type CompanyFundamental = {
  symbol: string;
  company_name: string;
  sector: string | null;
  eps: number | null;
  pe_ratio: number | null;
  paid_up_capital: number | null;
  net_profit: number | null;
  q1_growth_pct: number | null;
  q2_growth_pct: number | null;
  q3_growth_pct: number | null;
  q4_growth_pct: number | null;
  book_value: number | null;
  dividend_pct: number | null;
  market_cap: number | null;
  shares_outstanding: number | null;
  roe: number | null;
  pbv: number | null;
  debt_equity: number | null;
  fifty_two_week_range: string | null;
  last_updated: string;
  source: string;
  bonus_pct: number | null;
  right_share_pct: number | null;
  avg_30day_volume: number | null;
  last_traded_on: string | null;
  market_price: number | null;
  change_pct: number | null;
  year_yield: number | null;
  avg_120day: number | null;
  eps_fy: string | null;
  eps_quarter: number | null;
};

function parseNumber(s: string): number | null {
  const clean = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseNumberStrict(s: string): number {
  const n = parseNumber(s);
  return n ?? 0;
}

// Extract the full cell text (including span children) for EPS
function extractFieldFull(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fullRegex = new RegExp(
    `<th[^>]*>\\s*(?:<[^>]+>\\s*)*${escaped}[\\s\\S]*?<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "is"
  );
  const fullMatch = html.match(fullRegex);
  if (fullMatch?.[1]) {
    return fullMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

// Extract value from MeroLagani's main metrics table
function extractField(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fullRegex = new RegExp(
    `<th[^>]*>\\s*(?:<[^>]+>\\s*)*${escaped}[\\s\\S]*?<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "is"
  );
  const fullMatch = html.match(fullRegex);
  if (fullMatch?.[1]) {
    const text = fullMatch[1].replace(/<[^>]+>/g, "").trim();
    const firstLine = text.split(/[\r\n]+/)[0].trim();
    if (firstLine) return firstLine;
  }
  return "";
}

function extractAboutField(html: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<span title="${escaped}">[^<]*<\\/span><\\/th>\\s*<td>([^<]+)<\\/td>`,
    "is"
  );
  const m = html.match(regex);
  return m?.[1]?.trim() ?? "";
}

function extractName(html: string, symbol: string): string {
  const aboutName = extractAboutField(html, "Company Name");
  if (aboutName) return aboutName;
  const titleMatch = html.match(new RegExp(`<title>([^<]*?)\\s*\\(${symbol}\\)`, "i"));
  if (titleMatch?.[1]) {
    return titleMatch[1].trim().replace(/^merolagani\s*-\s*/i, "");
  }
  const hMatch = html.match(new RegExp(`<h[2-4][^>]*>\\s*([^<]+?)\\s*\\(${symbol}\\)`, "i"));
  return hMatch?.[1]?.trim() ?? "";
}

function parseDividends(html: string): { fiscalYear: string; value: number }[] {
  const items: { fiscalYear: string; value: number }[] = [];
  const regex = /<td class="text-center">\s*([\d.]+%)\s*<\/td>\s*<td class="text-center text-primary">\(FY:\s*([\d-]+)\)/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = parseFloat(m[1]);
    if (val > 0) {
      items.push({ value: val, fiscalYear: m[2] });
    }
  }
  return items;
}

export async function scrapeMeroLaganiFundamental(symbol: string): Promise<CompanyFundamental | null> {
  const url = `https://eng.merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const html = await res.text();

  const name = extractName(html, symbol);
  if (!name) return null;

  const sector = extractField(html, "Sector") || extractAboutField(html, "Sector");
  const sharesOutstanding = extractField(html, "Shares Outstanding");
  const mktPrice = parseNumber(extractField(html, "Market Price"));
  const eps = parseNumber(extractField(html, "EPS"));
  const pe = parseNumber(extractField(html, "P/E Ratio"));
  const bookValue = parseNumber(extractField(html, "Book Value"));
  const pbv = parseNumber(extractField(html, "PBV"));
  const marketCap = extractField(html, "Market Capitalization");
  const weekRange = extractField(html, "52 Weeks High - Low");
  const totalPaidup = extractAboutField(html, "Total Paidup Value");
  const dividends = parseDividends(html);
  const latestDividend = dividends[0]?.value ?? null;

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

  // NEW fields — full MeroLagani detail page
  const lastTradedOn = extractField(html, "Last Traded On");
  const bonusPct = parseNumber(extractField(html, "% Bonus"));
  const rightSharePct = parseNumber(extractField(html, "Right Share"));
  const avg30Vol = parseNumber(extractField(html, "30-Day Avg Volume"));
  const chgPct = parseNumber(extractField(html, "% Change"));
  const yearYield = parseNumber(extractField(html, "1 Year Yield"));
  const avg120 = parseNumber(extractField(html, "120 Day Average"));

  const today = new Date().toISOString().slice(0, 10);

  return {
    symbol,
    company_name: name,
    sector: sector || null,
    eps,
    pe_ratio: pe,
    paid_up_capital: parseNumber(totalPaidup),
    net_profit: null,
    q1_growth_pct: q1,
    q2_growth_pct: q2,
    q3_growth_pct: q3,
    q4_growth_pct: q4,
    book_value: bookValue,
    dividend_pct: latestDividend,
    market_cap: parseNumber(marketCap),
    shares_outstanding: parseNumber(sharesOutstanding),
    roe: null,
    pbv,
    debt_equity: null,
    fifty_two_week_range: weekRange || null,
    last_updated: today,
    source: "merolagani.com",
    bonus_pct: bonusPct,
    right_share_pct: rightSharePct,
    avg_30day_volume: avg30Vol,
    last_traded_on: lastTradedOn || null,
    market_price: mktPrice,
    change_pct: chgPct,
    year_yield: yearYield,
    avg_120day: avg120,
    eps_fy: epsFy,
    eps_quarter: epsQuarter,
  };
}

export async function upsertFundamental(f: CompanyFundamental): Promise<void> {
  // Try adding new columns — ignore if already exist
  for (const col of ["bonus_pct", "right_share_pct", "avg_30day_volume", "last_traded_on", "market_price", "change_pct", "year_yield", "avg_120day", "eps_fy", "eps_quarter"]) {
    try { await db.execute(`ALTER TABLE company_fundamentals ADD COLUMN ${col} NUMERIC`); } catch {}
  }

  await db.execute({
    sql: `INSERT INTO company_fundamentals (
      symbol, company_name, sector, eps, pe_ratio, paid_up_capital, net_profit,
      q1_growth_pct, q2_growth_pct, q3_growth_pct, q4_growth_pct,
      book_value, dividend_pct, market_cap, shares_outstanding, roe, pbv,
      debt_equity, fifty_two_week_range, last_updated, source,
      bonus_pct, right_share_pct, avg_30day_volume, last_traded_on,
      market_price, change_pct, year_yield, avg_120day,
      eps_fy, eps_quarter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      company_name = excluded.company_name,
      sector = excluded.sector,
      eps = COALESCE(excluded.eps, company_fundamentals.eps),
      pe_ratio = COALESCE(excluded.pe_ratio, company_fundamentals.pe_ratio),
      paid_up_capital = COALESCE(excluded.paid_up_capital, company_fundamentals.paid_up_capital),
      book_value = COALESCE(excluded.book_value, company_fundamentals.book_value),
      dividend_pct = COALESCE(excluded.dividend_pct, company_fundamentals.dividend_pct),
      market_cap = COALESCE(excluded.market_cap, company_fundamentals.market_cap),
      shares_outstanding = COALESCE(excluded.shares_outstanding, company_fundamentals.shares_outstanding),
      pbv = COALESCE(excluded.pbv, company_fundamentals.pbv),
      fifty_two_week_range = COALESCE(excluded.fifty_two_week_range, company_fundamentals.fifty_two_week_range),
      bonus_pct = COALESCE(excluded.bonus_pct, company_fundamentals.bonus_pct),
      right_share_pct = COALESCE(excluded.right_share_pct, company_fundamentals.right_share_pct),
      avg_30day_volume = COALESCE(excluded.avg_30day_volume, company_fundamentals.avg_30day_volume),
      last_traded_on = COALESCE(excluded.last_traded_on, company_fundamentals.last_traded_on),
      market_price = COALESCE(excluded.market_price, company_fundamentals.market_price),
      change_pct = COALESCE(excluded.change_pct, company_fundamentals.change_pct),
      year_yield = COALESCE(excluded.year_yield, company_fundamentals.year_yield),
      avg_120day = COALESCE(excluded.avg_120day, company_fundamentals.avg_120day),
      eps_fy = COALESCE(excluded.eps_fy, company_fundamentals.eps_fy),
      eps_quarter = COALESCE(excluded.eps_quarter, company_fundamentals.eps_quarter),
      q1_growth_pct = COALESCE(excluded.q1_growth_pct, company_fundamentals.q1_growth_pct),
      q2_growth_pct = COALESCE(excluded.q2_growth_pct, company_fundamentals.q2_growth_pct),
      q3_growth_pct = COALESCE(excluded.q3_growth_pct, company_fundamentals.q3_growth_pct),
      q4_growth_pct = COALESCE(excluded.q4_growth_pct, company_fundamentals.q4_growth_pct),
      last_updated = excluded.last_updated,
      source = excluded.source`,
    args: [
      f.symbol, f.company_name, f.sector, f.eps, f.pe_ratio,
      f.paid_up_capital, f.net_profit,
      f.q1_growth_pct, f.q2_growth_pct, f.q3_growth_pct, f.q4_growth_pct,
      f.book_value, f.dividend_pct, f.market_cap, f.shares_outstanding,
      f.roe, f.pbv, f.debt_equity, f.fifty_two_week_range,
      f.last_updated, f.source,
      f.bonus_pct, f.right_share_pct, f.avg_30day_volume, f.last_traded_on,
      f.market_price, f.change_pct, f.year_yield, f.avg_120day,
      f.eps_fy, f.eps_quarter,
    ],
  });
}

export async function getFundamental(symbol: string): Promise<CompanyFundamental | null> {
  const r = await db.execute({
    sql: "SELECT * FROM company_fundamentals WHERE symbol = ?",
    args: [symbol],
  });
  return (r.rows[0] as unknown as CompanyFundamental) ?? null;
}

export async function searchFundamentals(q: string): Promise<CompanyFundamental[]> {
  const pattern = `%${q.toLowerCase()}%`;
  const r = await db.execute({
    sql: `SELECT * FROM company_fundamentals
      WHERE LOWER(symbol) LIKE ? OR LOWER(company_name) LIKE ?
      ORDER BY
        CASE WHEN LOWER(symbol) = ? THEN 0
             WHEN LOWER(symbol) LIKE ? THEN 1
             ELSE 2
        END,
        company_name
      LIMIT 50`,
    args: [pattern, pattern, q.toLowerCase(), `${q.toLowerCase()}%`],
  });
  return r.rows as unknown as CompanyFundamental[];
}

export async function listFundamentals(sort?: string, dir?: string, page?: number): Promise<{ rows: CompanyFundamental[]; total: number }> {
  const allowedSort = ["symbol", "company_name", "sector", "eps", "pe_ratio", "paid_up_capital", "book_value", "dividend_pct", "market_cap", "last_updated"];
  const col = allowedSort.includes(sort || "") ? sort! : "symbol";
  const d = dir === "desc" ? "DESC" : "ASC";
  const limit = 100;
  const offset = ((page || 1) - 1) * limit;

  const countR = await db.execute("SELECT COUNT(*) as cnt FROM company_fundamentals");
  const total = Number(countR.rows[0]?.cnt || 0);

  const r = await db.execute({
    sql: `SELECT * FROM company_fundamentals ORDER BY ${col} ${d} LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });
  return { rows: r.rows as unknown as CompanyFundamental[], total };
}

export async function getAllSymbols(): Promise<string[]> {
  const r = await db.execute("SELECT symbol FROM company_fundamentals");
  return r.rows.map((x: any) => x.symbol);
}

export async function insertNews(symbol: string, headline: string, publishedAt: string, url?: string, source = "merolagani"): Promise<void> {
  await db.execute({
    sql: "INSERT INTO company_news (symbol, headline, published_at, url, source) VALUES (?, ?, ?, ?, ?)",
    args: [symbol, headline, publishedAt, url || null, source],
  });
}

export async function getNews(symbol: string, limit = 10): Promise<any[]> {
  try {
    const r = await db.execute({
      sql: "SELECT * FROM company_news WHERE symbol = ? ORDER BY published_at DESC LIMIT ?",
      args: [symbol, limit],
    });
    return r.rows;
  } catch {
    return [];
  }
}

// ============ JSON seed file (persists across Vercel instances) ============

let _seedData: CompanyFundamental[] | null = null;

function loadSeed(): CompanyFundamental[] {
  if (_seedData) return _seedData;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const seedPath = path.join(process.cwd(), "seed", "company_fundamentals.json");
    if (fs.existsSync(seedPath)) {
      const raw = fs.readFileSync(seedPath, "utf-8");
      _seedData = JSON.parse(raw) as CompanyFundamental[];
      return _seedData;
    }
  } catch {}
  return [];
}

export function searchFromSeed(q: string): CompanyFundamental[] {
  const data = loadSeed();
  if (!data.length) return [];
  const lower = q.toLowerCase();
  return data
    .filter((r) => r.symbol.toLowerCase().includes(lower) || r.company_name.toLowerCase().includes(lower))
    .sort((a, b) => {
      const aExact = a.symbol.toLowerCase() === lower ? 0 : a.symbol.toLowerCase().startsWith(lower) ? 1 : 2;
      const bExact = b.symbol.toLowerCase() === lower ? 0 : b.symbol.toLowerCase().startsWith(lower) ? 1 : 2;
      return aExact - bExact;
    })
    .slice(0, 50);
}

export function getFromSeed(symbol: string): CompanyFundamental | null {
  const data = loadSeed();
  return data.find((r) => r.symbol === symbol) ?? null;
}

export function listFromSeed(sort?: string, dir?: string, page = 1): { rows: CompanyFundamental[]; total: number } {
  const data = loadSeed();
  const allowedSort = ["symbol", "company_name", "sector", "eps", "pe_ratio", "paid_up_capital", "book_value", "dividend_pct", "market_cap", "last_updated"];
  const col = allowedSort.includes(sort || "") ? sort! : "symbol";
  const d = dir === "desc" ? -1 : 1;
  const limit = 100;
  const offset = ((page || 1) - 1) * limit;

  const sorted = [...data].sort((a: any, b: any) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";
    if (av === bv) return 0;
    return av < bv ? -d : d;
  });

  return { rows: sorted.slice(offset, offset + limit), total: data.length };
}
