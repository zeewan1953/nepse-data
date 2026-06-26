import { analyseStock } from "@/lib/stock-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  try {
    const result = await analyseStock(symbol);
    return Response.json(result, {
      status: "error" in result ? 404 : 200,
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message || "Analysis failed" }, { status: 500 });
  }
}
