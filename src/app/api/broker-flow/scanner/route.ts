import { cached } from "@/lib/nepse";
import { scanNextMove } from "@/lib/analysis/scanner";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Best 5 LONG + Best 5 SHORT scanner
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();

  try {
    const data = await cached(`bf-scan:${date}`, 3_000, async () => {
      const { longPicks, shortPicks } = await scanNextMove(date, 5);
      return { date, longPicks, shortPicks, generatedAt: Date.now() };
    });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Scanner failed" }, { status: 502 });
  }
}
