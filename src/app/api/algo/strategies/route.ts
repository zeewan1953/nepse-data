import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.execute("SELECT * FROM algo_strategies ORDER BY created_at DESC");
  const strategies = rows.rows.map(normalize);
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, universe, custom_symbol_list, entry_rule, exit_rule, stop_loss_pct, take_profit_pct, max_hold_days, position_size_pct, max_concurrent_positions } = body;

    if (!name || !entry_rule || !exit_rule) {
      return NextResponse.json({ error: "name, entry_rule, and exit_rule are required" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await db.execute({
      sql: `INSERT INTO algo_strategies (user_id, name, universe, custom_symbol_list, entry_rule, exit_rule, stop_loss_pct, take_profit_pct, max_hold_days, position_size_pct, max_concurrent_positions, updated_at, created_at)
            VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        name,
        universe || "all_listed",
        custom_symbol_list ? JSON.stringify(custom_symbol_list) : null,
        JSON.stringify(entry_rule),
        JSON.stringify(exit_rule),
        stop_loss_pct ?? null,
        take_profit_pct ?? null,
        max_hold_days ?? null,
        position_size_pct ?? 10,
        max_concurrent_positions ?? 5,
        now,
        now,
      ],
    });
    return NextResponse.json(normalize(result.rows[0]), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function normalize(row: any) {
  if (!row) return null;
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    universe: String(row.universe),
    custom_symbol_list: row.custom_symbol_list ? JSON.parse(String(row.custom_symbol_list)) : null,
    entry_rule: typeof row.entry_rule === "string" ? JSON.parse(row.entry_rule) : row.entry_rule,
    exit_rule: typeof row.exit_rule === "string" ? JSON.parse(row.exit_rule) : row.exit_rule,
    stop_loss_pct: row.stop_loss_pct != null ? Number(row.stop_loss_pct) : null,
    take_profit_pct: row.take_profit_pct != null ? Number(row.take_profit_pct) : null,
    max_hold_days: row.max_hold_days != null ? Number(row.max_hold_days) : null,
    position_size_pct: Number(row.position_size_pct),
    max_concurrent_positions: Number(row.max_concurrent_positions),
    is_active: Number(row.is_active) === 1,
    last_backtested_at: row.last_backtested_at != null ? Number(row.last_backtested_at) : null,
    updated_at: Number(row.updated_at),
    created_at: Number(row.created_at),
  };
}
