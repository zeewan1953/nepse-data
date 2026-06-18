import { cached } from "@/lib/nepse";
import { scanNextMove } from "@/lib/analysis/scanner";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// Best 5 next-move scanner: combines broker concentration, CMF, volume, net flow
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();

  try {
    const data = await cached(`bf-scan:${date}`, 3_000, async () => {
      const picks = await scanNextMove(date, 5);
      return { date, picks, generatedAt: Date.now() };
    });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Scanner failed" }, { status: 502 });
  }
}
