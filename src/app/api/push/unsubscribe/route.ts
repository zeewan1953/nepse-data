import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function POST(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await execute(
    "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    [uid, endpoint]
  );

  return NextResponse.json({ ok: true });
}
