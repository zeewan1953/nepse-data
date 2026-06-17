export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNumber(s: string): number {
  const clean = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

// Extract value from MeroLagani's main metrics table:
// <th style="width: 200px;">Label\r\n  </th>\r\n  <td class="">\r\n  VALUE\r\n  ...
function extractField(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // First try: extract everything between <td> and </td>, strip HTML tags, get first value
  const fullRegex = new RegExp(
    `<th[^>]*>\\s*${escaped}[\\s\\r\\n]*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "is"
  );
  const fullMatch = html.match(fullRegex);
  if (fullMatch?.[1]) {
    // Strip all HTML tags and get the text content
    const text = fullMatch[1].replace(/<[^>]+>/g, "").trim();
    // Get first line/value (before any newline or space-separated metadata)
    const firstLine = text.split(/[\r\n]+/)[0].trim();
    if (firstLine) return firstLine;
  }
  return "";
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

// Extract from About tab:
// <th>\n<span title="Company Name">Company Name</span></th>\n\n<td>VALUE</td>
function extractAboutField(html: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<span title="${escaped}">[^<]*<\\/span><\\/th>\\s*<td>([^<]+)<\\/td>`,
    "is"
  );
  const m = html.match(regex);
  return m?.[1]?.trim() ?? "";
}

// Extract Company Name from page title or About tab
function extractName(html: string, symbol: string): string {
  // Try About tab first (most reliable)
  const aboutName = extractAboutField(html, "Company Name");
  if (aboutName) return aboutName;
  
  // Try page title: <title>Company Name (SYMBOL) - MeroLagani</title>
  const titleMatch = html.match(new RegExp(`<title>([^<]*?)\\s*\\(${symbol}\\)`, "i"));
  if (titleMatch?.[1]) {
    let name = titleMatch[1].trim();
    // Remove "merolagani - " prefix if present
    name = name.replace(/^merolagani\s*-\s*/i, "");
    return name;
  }
  
  // Try h2/h3 with company name
  const hMatch = html.match(new RegExp(`<h[2-4][^>]*>\\s*([^<]+?)\\s*\\(${symbol}\\)`, "i"));
  return hMatch?.[1]?.trim() ?? "";
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
    const name = extractName(html, symbol);

    // Sector
    const sector = extractField(html, "Sector");

    // Shares outstanding
    const sharesOutstanding = extractField(html, "Shares Outstanding");

    // Market price / LTP
    const marketPrice = parseNumber(extractField(html, "Market Price"));

    // % Change
    const change = parseNumber(extractField(html, "% Change"));

    // EPS
    const eps = parseNumber(extractField(html, "EPS"));

    // PE Ratio
    const pe = parseNumber(extractField(html, "P/E Ratio"));

    // Book Value
    const bookValue = parseNumber(extractField(html, "Book Value"));

    // PBV
    const pbv = parseNumber(extractField(html, "PBV"));

    // Market Capitalization
    const marketCap = extractField(html, "Market Capitalization");

    // 52 week high/low
    const weekRange = extractField(html, "52 Weeks High - Low");

    // 1 Year Yield
    const yearYield = extractField(html, "1 Year Yield");

    // 120 Day Average
    const avg120 = extractField(html, "120 Day Average");

    // About tab fields
    const totalPaidup = extractAboutField(html, "Total Paidup Value");
    const paidupValue = extractAboutField(html, "Paidup Value");
    const listedShares = extractAboutField(html, "Listed Shares");
    const aboutSector = extractAboutField(html, "Sector");

    // Dividends
    const dividends = parseDividends(html);

    // Net Worth = Total Paidup Value
    const netWorth = parseNumber(totalPaidup);

    // These are not available on the CompanyDetail page
    const totalDebt = 0;
    const netProfit = 0;
    const revenue = 0;
    const roe = 0;
    const debtEquity = 0;

    return Response.json({
      symbol,
      name,
      sector: sector || aboutSector,
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
      yearYield,
      avg120,
      totalPaidup,
      paidupValue,
      listedShares,
      source: "merolagani.com",
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Failed to scrape MeroLagani" }, { status: 502 });
  }
}
