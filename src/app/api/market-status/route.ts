import { getNepse, cached } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await cached("market-status", 10_000, () =>
      getNepse().getMarketStatus(),
    );
    return Response.json(status);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load market status" },
      { status: 502 },
    );
  }
}
