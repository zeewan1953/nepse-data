import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

function userId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

// Get notifications (unread or all)
export async function GET(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const query = unreadOnly
    ? "SELECT atl.*, ua.alert_type, ua.symbol, ua.signal_name FROM alert_trigger_log atl JOIN user_alerts ua ON atl.alert_id = ua.id WHERE ua.user_id = ? AND atl.is_read = 0 ORDER BY atl.triggered_at DESC LIMIT 50"
    : "SELECT atl.*, ua.alert_type, ua.symbol, ua.signal_name FROM alert_trigger_log atl JOIN user_alerts ua ON atl.alert_id = ua.id WHERE ua.user_id = ? ORDER BY atl.triggered_at DESC LIMIT 50";

  const result = await execute(query, [uid]);

  // Get unread count
  const countResult = await execute(
    "SELECT COUNT(*) as count FROM alert_trigger_log atl JOIN user_alerts ua ON atl.alert_id = ua.id WHERE ua.user_id = ? AND atl.is_read = 0",
    [uid]
  );

  return NextResponse.json({
    notifications: result.rows,
    unreadCount: countResult.rows[0]?.count || 0,
  });
}

// Mark notification as read
export async function PATCH(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing notification id" }, { status: 400 });

  // Verify ownership before marking as read
  const verifyResult = await execute(
    "SELECT atl.id FROM alert_trigger_log atl JOIN user_alerts ua ON atl.alert_id = ua.id WHERE atl.id = ? AND ua.user_id = ?",
    [id, uid]
  );

  if (verifyResult.rows.length === 0) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  await execute(
    "UPDATE alert_trigger_log SET is_read = 1 WHERE id = ?",
    [id]
  );

  return NextResponse.json({ success: true });
}
