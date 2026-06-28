import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function POST(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Missing endpoint/keys" }, { status: 400 });
  }

  await execute(
    `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [uid, endpoint, keys.p256dh, keys.auth, Date.now()]
  );

  return NextResponse.json({ ok: true });
}
