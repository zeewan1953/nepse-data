import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mero = await fetchMeroLaganiSummary();
  if (!mero) return Response.json({ error: "no data" }, { status: 502 });
  return Response.json({
    stockCount: mero.stock?.detail?.length ?? 0,
    turnoverCount: mero.turnover?.detail?.length ?? 0,
    sample: mero.turnover?.detail?.[0] ?? null,
  });
}
