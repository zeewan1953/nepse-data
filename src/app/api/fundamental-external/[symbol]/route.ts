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

    // Dividends
    const dividends = parseDividends(html);

    // 52 week high/low
    const rangeMatch = html.match(/52 Weeks High - Low<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    const weekRange = rangeMatch?.[1]?.trim() ?? "";

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
      source: "merolagani.com",
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Failed to scrape MeroLagani" }, { status: 502 });
  }
}
