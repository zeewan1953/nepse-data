import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.execute({
      sql: "SELECT id, timestamp, payload FROM health_check_runs ORDER BY id DESC LIMIT 20",
    });
    const runs = result.rows.map((r) => ({
      id: Number(r.id),
      timestamp: String(r.timestamp),
      payload: JSON.parse(String(r.payload)),
    }));
    return Response.json({ count: runs.length, runs });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 500 });
  }
}
