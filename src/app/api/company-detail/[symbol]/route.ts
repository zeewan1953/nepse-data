import { getFundamental, getNews, getFromSeed, searchFromSeed } from "@/lib/fundamental-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  // Try seed JSON first
  let fundamental = getFromSeed(symbol);

  // Fallback to DB
  if (!fundamental) {
    fundamental = await getFundamental(symbol);
  }

  if (!fundamental) {
    // Try partial match from seed
    const partial = searchFromSeed(symbol);
    if (partial.length > 0) {
      return Response.json({
        error: `"${symbol}" not found. Did you mean one of these?`,
        suggestions: partial.slice(0, 5).map((r) => r.symbol),
      }, { status: 404 });
    }
    return Response.json({ error: `"${symbol}" not found in fundamentals database` }, { status: 404 });
  }

  const news = await getNews(symbol, 10);

  return Response.json({ fundamental, news });
}
