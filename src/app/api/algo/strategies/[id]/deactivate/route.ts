import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.execute({ sql: "UPDATE algo_strategies SET is_active = 0 WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
