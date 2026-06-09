import { getNepse, cached } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Top gainers, losers, by turnover, by volume (shares traded) and by number of
// transactions — everything the dashboard needs in one round trip.
export async function GET() {
  try {
    const nepse = getNepse();
    const data = await cached("movers", 8_000, async () => {
      const [gainers, losers, turnover, volume, transactions] = await Promise.all([
        nepse.getTopTenGainers(),
        nepse.getTopTenLosers(),
        nepse.getTopTenTurnoverScrips(),
        nepse.getTopTenTradeScrips(),
        nepse.getTopTenTransactionScrips(),
      ]);
      return { gainers, losers, turnover, volume, transactions };
    });
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load movers" },
      { status: 502 },
    );
  }
}
