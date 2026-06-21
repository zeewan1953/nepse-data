import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all stocks from MeroLagani (same source as /api/live)
    const mero = await fetchMeroLaganiSummary();
    if (!mero?.stock?.detail?.length) {
      return Response.json({ stocks: [], count: 0 });
    }

    const stocks = mero.stock.detail
      .map((s) => ({
        symbol: s.s,
        name: s.s,
        price: s.lp,
        change: calcMeroPercent(s),
        volume: s.q,
        turnover: s.lp * s.q,
      }))
      .sort((a, b) => b.turnover - a.turnover);

    return Response.json({ stocks, count: stocks.length });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to fetch stocks" },
      { status: 502 }
    );
  }
}
