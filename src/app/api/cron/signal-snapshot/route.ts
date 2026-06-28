import { NextResponse } from "next/server";
import { captureDailySnapshot } from "@/lib/signal-backtest";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const result = await captureDailySnapshot();
    return NextResponse.json({
      success: true,
      ...result,
      duration: Date.now() - start,
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
      duration: Date.now() - start,
      ts: Date.now(),
    }, { status: 500 });
  }
}
