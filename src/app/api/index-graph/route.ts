import { getNepse, cached } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NEPSE index intraday graph: array of [unixSeconds, value]. (NEPSE's free feed
// only exposes the current session's intraday points, not multi-year history.)
export async function GET() {
  try {
    const points = await cached("index-graph", 15_000, () =>
      getNepse().getNepseIndexDailyGraph(),
    );
    return Response.json({ points });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load index graph" },
      { status: 502 },
    );
  }
}
