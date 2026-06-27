import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const section = params.get("section") || "scanner";
  const date = params.get("date") || todayStr();

  return Response.json({
    dataAvailable: false,
    error: "Broker flow analytics requires real data. Run /api/cron/collect?attempt=1 to sync, then use /api/broker-flow/{scanner,overview,leaderboard,stock} for individual sections.",
    date,
    section,
  }, { status: 503 });
}
