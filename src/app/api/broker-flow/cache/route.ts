import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// DELETE /api/broker-flow/cache?date=YYYY-MM-DD — clears cached data for a date
export async function DELETE(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  try {
    await db.execute({ sql: "DELETE FROM broker_flow_cache WHERE date = ?", args: [date] });
    return Response.json({ ok: true, date, cleared: true });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Cache clear failed" }, { status: 502 });
  }
}
