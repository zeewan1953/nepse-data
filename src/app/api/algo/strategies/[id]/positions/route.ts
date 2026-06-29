import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db.execute({
    sql: "SELECT * FROM algo_strategy_positions WHERE strategy_id = ? ORDER BY entry_date DESC",
    args: [Number(id)],
  });
  return NextResponse.json(
    rows.rows.map((r: any) => ({
      id: Number(r.id),
      strategy_id: Number(r.strategy_id),
      symbol: String(r.symbol),
      entry_trade_id: r.entry_trade_id != null ? Number(r.entry_trade_id) : null,
      exit_trade_id: r.exit_trade_id != null ? Number(r.exit_trade_id) : null,
      entry_date: String(r.entry_date),
      exit_date: r.exit_date != null ? String(r.exit_date) : null,
      entry_price: Number(r.entry_price),
      exit_price: r.exit_price != null ? Number(r.exit_price) : null,
      status: String(r.status),
      exit_reason: r.exit_reason != null ? String(r.exit_reason) : null,
    })),
  );
}
