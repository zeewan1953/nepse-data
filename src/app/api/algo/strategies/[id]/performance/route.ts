import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const trades = await db.execute({
    sql: `SELECT p.*, t.realized_pnl, t.price, t.quantity, t.executed_at
          FROM algo_strategy_positions p
          LEFT JOIN paper_trade_history t ON t.id = p.entry_trade_id
          WHERE p.strategy_id = ?
          ORDER BY p.entry_date DESC`,
    args: [Number(id)],
  });

  const closed = trades.rows.filter((r: any) => r.status === "closed");
  const totalPnl = closed.reduce((sum: number, r: any) => sum + (r.realized_pnl ?? 0), 0);
  const wins = closed.filter((r: any) => (r.realized_pnl ?? 0) > 0).length;
  const losses = closed.filter((r: any) => (r.realized_pnl ?? 0) <= 0).length;
  const tradeCount = closed.length;
  const winRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;
  const avgPnl = tradeCount > 0 ? totalPnl / tradeCount : 0;
  const totalFees = closed.reduce((sum: number, r: any) => sum + (r.fees ?? 0), 0);

  return NextResponse.json({
    totalPnl: Math.round(totalPnl * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    tradeCount,
    wins,
    losses,
    avgPnl: Math.round(avgPnl * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    openPositions: trades.rows.filter((r: any) => r.status === "open").length,
  });
}
