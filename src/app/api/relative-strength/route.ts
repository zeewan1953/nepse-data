import { getRelativeStrengthFromSeed, computeRelativeStrength } from "@/lib/relative-strength";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getRelativeStrengthFromSeed();
    if (data.length > 0) {
      return Response.json({ success: true, data, source: "seed" });
    }
    const computed = await computeRelativeStrength();
    return Response.json({
      success: true,
      data: computed.slice(0, 20),
      source: "live",
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
