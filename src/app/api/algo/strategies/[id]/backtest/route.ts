import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBacktest } from "@/lib/algo/backtest-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await runBacktest(Number(id));
    // Update last_backtested_at
    await db.execute({
      sql: "UPDATE algo_strategies SET last_backtested_at = ? WHERE id = ?",
      args: [Math.floor(Date.now() / 1000), Number(id)],
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
