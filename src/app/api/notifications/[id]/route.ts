import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { id } = await params;

  // Only mark as read if this notification belongs to the user
  await execute(
    `UPDATE alert_trigger_log SET is_read = 1
     WHERE id = ? AND alert_id IN (SELECT id FROM user_alerts WHERE user_id = ?)`,
    [id, uid]
  );

  return NextResponse.json({ ok: true });
}
