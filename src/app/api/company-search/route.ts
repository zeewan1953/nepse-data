import { searchFundamentals, searchFromSeed } from "@/lib/fundamental-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return Response.json({ error: "Query parameter 'q' is required (min 1 char)" }, { status: 400 });
  }

  // Try seed JSON first (fast, persists across Vercel instances)
  const seedResults = searchFromSeed(q);
  if (seedResults.length > 0) {
    return Response.json({ query: q, count: seedResults.length, source: "seed", results: seedResults });
  }

  // Fallback to DB
  const dbResults = await searchFundamentals(q);
  return Response.json({ query: q, count: dbResults.length, source: "db", results: dbResults });
}
