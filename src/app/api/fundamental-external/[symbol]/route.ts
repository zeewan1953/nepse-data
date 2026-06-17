export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNumber(s: string): number {
  const clean = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseDividends(html: string): { fiscalYear: string; value: number }[] {
  const items: { fiscalYear: string; value: number }[] = [];
  // Match rows like: 12.50% (FY: 078-079)
  const regex = /([\d.]+)%\s*\(FY:\s*(\d{3}-\d{3})\)/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    items.push({ value: parseFloat(m[1]), fiscalYear: m[2] });
  }
  return items;
}

function extractFinancialTable(html: string): { label: string; values: string[] }[] {
  const rows: { label: string; values: string[] }[] = [];
  // Look for tables with financial data (Year, Revenue, Profit, EPS, etc.)
  const tableRegex = /<table[^>]*class="[^"]*table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
      if (cells.length >= 2 && !cells[0].match(/^\d{4}/) && !cells[0].match(/^S\.N/)) {
        rows.push({ label: cells[0], values: cells.slice(1) });
      }
    }
  }
  return rows;
}

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  try {
    const url = `https://eng.merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return Response.json({ error: `MeroLagani returned ${res.status}` }, { status: 502 });
    }

    const html = await res.text();

    // Company name
    const titleMatch = html.match(/<h[1-6][^>]*>\s*([^<]+?)\s*\(\s*${symbol}\s*\)\s*<\/h[1-6]>/i);
    const nameMatch = html.match(/Company Name<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const name = titleMatch?.[1]?.trim() ?? nameMatch?.[1]?.trim() ?? "";

    // Sector
    const sectorMatch = html.match(/Sector<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const sector = sectorMatch?.[1]?.trim() ?? "";

    // Shares outstanding
    const sharesMatch = html.match(/Shares Outstanding<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const sharesOutstanding = sharesMatch?.[1]?.trim() ?? "";

    // Market price / LTP
    const priceMatch = html.match(/Market Price<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const marketPrice = parseNumber(priceMatch?.[1] ?? "0");

    // % Change
    const changeMatch = html.match(/% Change<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const change = parseNumber(changeMatch?.[1] ?? "0");

    // EPS
    const epsMatch = html.match(/EPS<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const eps = parseNumber(epsMatch?.[1] ?? "0");

    // PE
    const peMatch = html.match(/P\/E Ratio<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const pe = parseNumber(peMatch?.[1] ?? "0");

    // Book Value / PBV
    const bvMatch = html.match(/Book Value<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const pbvMatch = html.match(/PBV<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const bookValue = parseNumber(bvMatch?.[1] ?? "0");
    const pbv = parseNumber(pbvMatch?.[1] ?? "0");

    // Market cap
    const capMatch = html.match(/Market Capitalization<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const marketCap = capMatch?.[1]?.trim() ?? "";

    // Net Worth (Reserve & Surplus)
    const reserveMatch = html.match(/Reserve &amp; Surplus<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const paidUpMatch = html.match(/Paid Up Capital<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const reserve = parseNumber(reserveMatch?.[1] ?? "0");
    const paidUp = parseNumber(paidUpMatch?.[1] ?? "0");
    const netWorth = reserve + paidUp;

    // Total Debt (Borrowings)
    const debtMatch = html.match(/Total Liabilities<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const totalDebt = parseNumber(debtMatch?.[1] ?? "0");

    // Net Profit
    const profitMatch = html.match(/Net Profit<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const netProfit = parseNumber(profitMatch?.[1] ?? "0");

    // Revenue / Operating Income
    const revenueMatch = html.match(/Operating Revenue<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const revenue = parseNumber(revenueMatch?.[1] ?? "0");

    // ROE (calculated or from page)
    const roeMatch = html.match(/ROE\s*\(%\)<\/td>\s*<td[^>]*>([\d.,]+)/i);
    const roe = roeMatch ? parseNumber(roeMatch[1]) : (netWorth > 0 && netProfit > 0 ? (netProfit / netWorth) * 100 : 0);

    // Debt to Equity
    const debtEquity = netWorth > 0 ? totalDebt / netWorth : 0;

    // Dividends
    const dividends = parseDividends(html);

    // 52 week high/low
    const rangeMatch = html.match(/52 Weeks High - Low<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const weekRange = rangeMatch?.[1]?.trim() ?? "";

    // Financial tables
    const financials = extractFinancialTable(html);

    return Response.json({
      symbol,
      name,
      sector,
      sharesOutstanding,
      marketPrice,
      change,
      eps,
      pe,
      bookValue,
      pbv,
      marketCap,
      weekRange,
      dividends,
      netWorth,
      totalDebt,
      netProfit,
      revenue,
      roe,
      debtEquity,
      financials,
      source: "merolagani.com",
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Failed to scrape MeroLagani" }, { status: 502 });
  }
}
