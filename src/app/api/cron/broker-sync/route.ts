import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Broker Flow Daily Sync Cron
 *
 * Meant to be called daily at 3:10 PM Nepal time (after NEPSE market close).
 *
 * Steps:
 * 1. Clear all cached broker-flow data for today so fresh data is recomputed
 * 2. Trigger floorsheet sync (which fetches from NEPSE and saves to DB)
 * 3. Return sync stats
 *
 * In production, wire this to Vercel Cron or an external scheduler.
 * Can also be triggered manually via the frontend "Sync Now" button.
 */

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();

  try {
    // 1. Clear broker-flow cache for this date so fresh data is recomputed
    let cleared = 0;
    try {
      const result = await db.execute({
        sql: "DELETE FROM broker_flow_cache WHERE date = ?",
        args: [date],
      });
      cleared = result.rowsAffected ?? 0;
    } catch { /* cache table may not exist yet */ }

    // 2. Trigger floorsheet sync by calling the existing endpoint
    const baseUrl = req.nextUrl.origin;
    let syncResult = { status: "skipped", message: "Could not trigger sync" };
    try {
      const syncResp = await fetch(`${baseUrl}/api/floorsheet/sync?date=${date}`, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });
      if (syncResp.ok) {
        syncResult = await syncResp.json();
      } else {
        syncResult = { status: "error", message: `Sync returned ${syncResp.status}` };
      }
    } catch (e) {
      syncResult = { status: "error", message: (e as Error).message };
    }

    return Response.json({
      success: true,
      date,
      cacheCleared: cleared,
      sync: syncResult,
      ts: Date.now(),
      message: `Broker sync complete for ${date}`,
    });
  } catch (e) {
    return Response.json({
      success: false,
      date,
      message: (e as Error).message ?? "Broker sync failed",
      ts: Date.now(),
    }, { status: 500 });
  }
}
