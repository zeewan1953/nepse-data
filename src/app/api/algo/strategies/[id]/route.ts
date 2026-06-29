import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.execute({ sql: "SELECT * FROM algo_strategies WHERE id = ?", args: [Number(id)] });
  if (!row.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(normalize(row.rows[0]));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();

  const fields: string[] = [];
  const args: any[] = [];

  for (const key of ["name", "universe", "custom_symbol_list", "entry_rule", "exit_rule", "stop_loss_pct", "take_profit_pct", "max_hold_days", "position_size_pct", "max_concurrent_positions"]) {
    if (body[key] !== undefined) {
      if (key === "custom_symbol_list") {
        fields.push("custom_symbol_list = ?");
        args.push(JSON.stringify(body[key]));
      } else if (key === "entry_rule" || key === "exit_rule") {
        fields.push(`${key} = ?`);
        args.push(JSON.stringify(body[key]));
      } else {
        fields.push(`${key} = ?`);
        args.push(body[key]);
      }
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Editing rule/params deactivates and clears backtest gate
  const ruleKeys = ["name", "universe", "custom_symbol_list", "entry_rule", "exit_rule", "stop_loss_pct", "take_profit_pct", "max_hold_days", "position_size_pct", "max_concurrent_positions"];
  const isRuleEdit = ruleKeys.some((k) => body[k] !== undefined);

  fields.push("is_active = 0");
  if (isRuleEdit) {
    fields.push("last_backtested_at = NULL");
  }
  fields.push("updated_at = ?");
  args.push(Math.floor(Date.now() / 1000));
  args.push(Number(id));

  await db.execute({
    sql: `UPDATE algo_strategies SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  const updated = await db.execute({ sql: "SELECT * FROM algo_strategies WHERE id = ?", args: [Number(id)] });
  if (!updated.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(normalize(updated.rows[0]));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const positions = await db.execute({ sql: "SELECT id FROM algo_strategy_positions WHERE strategy_id = ? AND status = 'open'", args: [Number(id)] });
  if (positions.rows.length > 0) {
    return NextResponse.json({ error: "Cannot delete strategy with open positions" }, { status: 400 });
  }
  await db.execute({ sql: "DELETE FROM algo_strategies WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
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
