import { getNepse, cached } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nepse = getNepse();
    const [index, subIndices] = await cached("indices", 8_000, async () =>
      Promise.all([nepse.getNepseIndex(), nepse.getNepseSubIndices()]),
    );
    return Response.json({ index, subIndices });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load indices" },
      { status: 502 },
    );
  }
}
