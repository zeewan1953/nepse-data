import "server-only";
import { db, getSyncLogs } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 100;
    const logs = await getSyncLogs(Math.min(limit, 500));
    return Response.json({ logs });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to load sync logs" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const olderThanDays = body.olderThanDays || 90;
    const cutoff = Date.now() - olderThanDays * 86400000;
    const r = await db.execute({ sql: "DELETE FROM sync_logs WHERE ts < ?", args: [cutoff] });
    return Response.json({ deleted: r.rowsAffected ?? 0 });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to clear sync logs" }, { status: 500 });
  }
}
