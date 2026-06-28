import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const allowed = ["symbol", "broker_id", "signal_name", "condition", "threshold", "is_active"];
  const sets: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(body[key]);
    }
  }

  if (!sets.length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  vals.push(id, uid);
  await execute(
    `UPDATE user_alerts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    vals
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { id } = await params;
  await execute("DELETE FROM user_alerts WHERE id = ? AND user_id = ?", [id, uid]);
  return NextResponse.json({ ok: true });
}
