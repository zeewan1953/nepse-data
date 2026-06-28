import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function GET(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  const sql = unreadOnly
    ? `SELECT t.*, a.alert_type, a.symbol, a.broker_id, a.signal_name
       FROM alert_trigger_log t
       JOIN user_alerts a ON t.alert_id = a.id
       WHERE a.user_id = ? AND t.is_read = 0
       ORDER BY t.triggered_at DESC LIMIT ?`
    : `SELECT t.*, a.alert_type, a.symbol, a.broker_id, a.signal_name
       FROM alert_trigger_log t
       JOIN user_alerts a ON t.alert_id = a.id
       WHERE a.user_id = ?
       ORDER BY t.triggered_at DESC LIMIT ?`;

  const result = await execute(sql, [uid, limit]);
  return NextResponse.json({ notifications: result.rows });
}
