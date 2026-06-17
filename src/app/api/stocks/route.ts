import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import { saveStocks, getAllStocks, searchStocks } from "@/lib/db";
import type { LiveMarketData, Security } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sync NEPSE stocks into local database, then return all or search results
async function syncStocks(): Promise<void> {
  const nepse = getNepse();

  // Try live market first
  const live = await safeNepseCall(() => nepse.getLiveMarket(), "Live market").catch(() => [] as LiveMarketData[]);
  if (Array.isArray(live) && live.length > 50) {
    const rows = live.map((l) => ({
      symbol: l.symbol,
      name: l.securityName,
      lastTradedPrice: l.lastTradedPrice ?? 0,
      percentageChange: l.percentageChange ?? 0,
      totalTradeQuantity: l.totalTradeQuantity ?? 0,
    }));
    await saveStocks(rows);
    return;
  }

  // Fallback: security list
  const securities = await safeNepseCall(() => nepse.getSecurityList(), "Security list").catch(() => []);
  if (Array.isArray(securities) && securities.length > 0) {
    const rows = securities
      .filter((s: Security) => s.activeStatus === "A")
      .map((s: Security) => ({
        symbol: s.symbol,
        name: s.securityName ?? s.name ?? s.symbol,
        lastTradedPrice: 0,
        percentageChange: 0,
        totalTradeQuantity: 0,
      }));
    await saveStocks(rows);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    // Sync from NEPSE (cached 10s to avoid hammering)
    await cached("stock-sync", 10_000, syncStocks);

    // Search or return all
    const stocks = q ? await searchStocks(q) : await getAllStocks();
    return Response.json({ data: stocks, count: stocks.length, source: "db" });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to search stocks", data: [], count: 0 },
      { status: 500 },
    );
  }
}
