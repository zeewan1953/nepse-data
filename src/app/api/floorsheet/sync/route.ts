import { getNepse, cached } from "@/lib/nepse";
import { saveFloorsheetTrades, getFloorsheetCount, getAvailableDates } from "@/lib/db";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 30;

// Today's date in YYYY-MM-DD format (Nepal time)
function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

async function fetchAllTrades(): Promise<FloorSheetItem[]> {
  const nepse = getNepse();
  const first = await nepse.getFloorSheet({ page: 0, size: PAGE_SIZE }) as FloorSheet;
  const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
  const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    const res = await Promise.all(
      batch.map((p) =>
        nepse.getFloorSheet({ page: p, size: PAGE_SIZE })
          .then((r) => (r as FloorSheet).floorsheets?.content ?? [])
          .catch(() => []),
      ),
    );
    res.forEach((r) => items.push(...r));
  }
  return items;
}

export async function GET() {
  try {
    const date = todayStr();

    // Use 3-second cache to avoid hammering NEPSE
    const result = await cached(`fs-sync:${date}`, 3_000, async () => {
      // Check if we already have today's data and how many
      const existingCount = await getFloorsheetCount(date);

      // Fetch fresh from NEPSE
      const items = await fetchAllTrades();

      // Only re-save if count changed or we have no data
      if (items.length !== existingCount || existingCount === 0) {
        const trades = items.map((t) => ({
          tradeDate: date,
          stockSymbol: t.stockSymbol,
          securityName: t.securityName,
          buyerMemberId: String(t.buyerMemberId),
          sellerMemberId: String(t.sellerMemberId),
          contractQuantity: t.contractQuantity,
          contractAmount: t.contractAmount,
        }));
        await saveFloorsheetTrades(date, trades);
      }

      const dates = await getAvailableDates();

      return {
        date,
        tradeCount: items.length,
        syncedAt: Date.now(),
        dates,
      };
    });

    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Sync failed" },
      { status: 502 },
    );
  }
}
