import { getNepse, cached } from "@/lib/nepse";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Floorsheet = every executed trade: which broker bought from which broker,
// which stock, how much quantity, at what rate. Supports paging + filtering by
// symbol / buyer broker / seller broker.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get("page") ?? "0");
    const size = Math.min(Number(sp.get("size") ?? "50"), 500);
    const symbol = sp.get("symbol") ?? undefined;
    const buyerBroker = sp.get("buyerBroker");
    const sellerBroker = sp.get("sellerBroker");

    const key = `floorsheet:${page}:${size}:${symbol ?? ""}:${buyerBroker ?? ""}:${sellerBroker ?? ""}`;
    const data = await cached(key, 5_000, () =>
      getNepse().getFloorSheet({
        page,
        size,
        symbol: symbol || undefined,
        buyerBroker: buyerBroker ? Number(buyerBroker) : undefined,
        sellerBroker: sellerBroker ? Number(sellerBroker) : undefined,
      }),
    );
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load floorsheet" },
      { status: 502 },
    );
  }
}
