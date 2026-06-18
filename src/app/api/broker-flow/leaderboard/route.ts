import { cached } from "@/lib/nepse";
import { getAnomalyLeaderboard } from "@/lib/analysis/anomaly";
import { findCrossStockPatterns } from "@/lib/analysis/crossStock";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Market-wide daily leaderboard: accumulation/distribution + cross-stock patterns
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();

  try {
    const data = await cached(`bf-lb:${date}`, 3_000, async () => {
      const [leaderboard, patterns] = await Promise.all([
        getAnomalyLeaderboard(date, 20),
        findCrossStockPatterns(date, 5, 3, 100000),
      ]);
      return { date, ...leaderboard, crossStockPatterns: patterns };
    });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Leaderboard failed" }, { status: 502 });
  }
}
