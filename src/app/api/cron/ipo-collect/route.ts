import { NextResponse } from "next/server";
import { scrapeMeroLaganiIPO } from "@/lib/ipo-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await scrapeMeroLaganiIPO();
    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      ts: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
