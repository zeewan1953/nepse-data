import { getNepse, cached, safeNepseCall } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const points = await cached("index-graph", 15_000, () =>
      safeNepseCall(() => getNepse().getNepseIndexDailyGraph(), "Index graph"),
    );
    if (Array.isArray(points) && points.length >= 2) {
      return Response.json({ points, source: "nepse" });
    }
    return Response.json(
      { error: "No NEPSE index data available", source: "none" },
      { status: 404 },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load index graph", source: "none" },
      { status: 502 },
    );
  }
}
