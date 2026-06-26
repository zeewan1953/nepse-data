import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { scrapeMeroLaganiFundamental, upsertFundamental, getAllSymbols } from "@/lib/fundamental-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return POST();
}

export async function POST() {
  const start = Date.now();
  const results: { symbol: string; status: string; error?: string }[] = [];

  try {
    // Get all symbols from MeroLagani live data
    const mero = await fetchMeroLaganiSummary();
    if (!mero?.turnover?.detail) {
      return Response.json({ error: "MeroLagani data unavailable", results }, { status: 502 });
    }

    const symbols = mero.turnover.detail.map((s: any) => s.s).slice(0, 338);
    const existing = await getAllSymbols();
    const existingSet = new Set(existing);

    // Only scrape symbols not yet in DB, plus random 10 existing for refresh
    const toScrape = symbols.filter((s: string) => !existingSet.has(s));
    const toRefresh = symbols.filter((s: string) => existingSet.has(s)).sort(() => Math.random() - 0.5).slice(0, 10);

    const all = [...new Set([...toScrape, ...toRefresh])];
    const batchSize = 5;

    for (let i = 0; i < all.length; i += batchSize) {
      const batch = all.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const f = await scrapeMeroLaganiFundamental(symbol);
            if (f) {
              await upsertFundamental(f);
              results.push({ symbol, status: "updated" });
            } else {
              results.push({ symbol, status: "skipped" });
            }
          } catch (e) {
            results.push({ symbol, status: "error", error: (e as Error)?.message });
          }
        })
      );
    }

    return Response.json({
      summary: `Scraped ${results.filter((r) => r.status === "updated").length} companies in ${Date.now() - start}ms`,
      total: results.length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message, results }, { status: 500 });
  }
}
