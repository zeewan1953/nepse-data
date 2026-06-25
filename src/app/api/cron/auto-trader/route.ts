import { runAutoTrader, scheduleNextTick } from "@/lib/auto-trader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runAutoTrader();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Auto-trader failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
