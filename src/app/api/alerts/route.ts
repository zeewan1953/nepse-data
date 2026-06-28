import { NextRequest, NextResponse } from "next/server";
import { db, execute } from "@/lib/db";

function userId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function GET(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const result = await execute(
    "SELECT * FROM user_alerts WHERE user_id = ? ORDER BY created_at DESC",
    [uid]
  );
  return NextResponse.json({ alerts: result.rows });
}

export async function POST(req: NextRequest) {
  const uid = userId(req);
  if (!uid) return NextResponse.json({ error: "x-user-id header required" }, { status: 401 });

  const body = await req.json();
  const { alert_type, symbol, broker_id, signal_name, condition, threshold } = body;

  if (!alert_type || !condition || threshold === undefined) {
    return NextResponse.json({ error: "Missing required fields: alert_type, condition, threshold" }, { status: 400 });
  }

  if (!["price", "signal", "broker_flow"].includes(alert_type)) {
    return NextResponse.json({ error: "Invalid alert_type" }, { status: 400 });
  }
  if (!["above", "below", "crosses_up", "crosses_down"].includes(condition)) {
    return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
  }
  if (typeof threshold !== "number") {
    return NextResponse.json({ error: "threshold must be a number" }, { status: 400 });
  }

  // Ensure user exists
  await execute(
    `INSERT OR IGNORE INTO users (id, email, name, passwordHash, verified, createdAt) VALUES (?, ?, ?, ?, 1, ?)`,
    [uid, `${uid}@device.local`, `Device-${uid.slice(0, 8)}`, "dev", Date.now()]
  );

  const result = await execute(
    `INSERT INTO user_alerts (user_id, alert_type, symbol, broker_id, signal_name, condition, threshold, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [uid, alert_type, symbol || null, broker_id || null, signal_name || null, condition, threshold, Date.now()]
  );

  return NextResponse.json({ alert: result.rows[0] }, { status: 201 });
}
