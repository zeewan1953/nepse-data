import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

function userId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

// Subscribe to Web Push
export async function POST(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const body = await req.json();
  const { endpoint, p256dh_key, auth_key } = body;

  if (!endpoint || !p256dh_key || !auth_key) {
    return NextResponse.json({ error: "Missing required fields: endpoint, p256dh_key, auth_key" }, { status: 400 });
  }

  // Ensure user exists
  await execute(
    `INSERT OR IGNORE INTO users (id, email, name, passwordHash, verified, createdAt) VALUES (?, ?, ?, ?, 1, ?)`,
    [uid, `${uid}@device.local`, `Device-${uid.slice(0, 8)}`, "dev", Date.now()]
  );

  try {
    await execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uid, endpoint, p256dh_key, auth_key, Date.now()]
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    // Handle unique constraint violation (duplicate subscription)
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.message?.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ success: true, message: "Already subscribed" }, { status: 200 });
    }
    throw error;
  }
}

// Unsubscribe from Web Push
export async function DELETE(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint parameter" }, { status: 400 });
  }

  await execute(
    "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    [uid, endpoint]
  );

  return NextResponse.json({ success: true });
}
