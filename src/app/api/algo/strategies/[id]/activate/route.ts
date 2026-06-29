import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.execute({ sql: "SELECT last_backtested_at, updated_at, is_active FROM algo_strategies WHERE id = ?", args: [Number(id)] });
  if (!row.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const s = row.rows[0];
  if (Number(s.is_active) === 1) {
    return NextResponse.json({ error: "Strategy is already active" }, { status: 400 });
  }
  if (s.last_backtested_at == null || Number(s.last_backtested_at) < Number(s.updated_at)) {
    return NextResponse.json({ error: "Strategy must be backtested after the latest edit before activation" }, { status: 400 });
  }

  await db.execute({ sql: "UPDATE algo_strategies SET is_active = 1 WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
