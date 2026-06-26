import { listFundamentals, listFromSeed } from "@/lib/fundamental-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") || undefined;
  const dir = searchParams.get("dir") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Seed is authoritative (deployed JSON), DB for any extra
  const seed = listFromSeed(sort, dir, page);
  if (seed.total > 0) {
    return Response.json({ total: seed.total, page, rows: seed.rows, source: "seed" });
  }

  const db = await listFundamentals(sort, dir, page);
  return Response.json({ total: db.total, page, rows: db.rows, source: "db" });
}
