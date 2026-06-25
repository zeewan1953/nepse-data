import { runHealthCheck } from "@/lib/health-check";
import { heal, getConfig } from "@/lib/self-healer";
import { tickAutoTrader } from "@/lib/auto-trader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const check = await runHealthCheck();
    let healResult = null;

    // If failures detected, run self-healer
    if (check.anyFailures) {
      healResult = await heal(check.results.map((r) => ({
        endpoint: r.endpoint,
        valueSanity: r.valueSanity,
      })));
    }

    // Also run auto-trader tick during market hours
    let autoTraderResult = null;
    try {
      autoTraderResult = await tickAutoTrader();
    } catch {}

    return Response.json({
      ...check,
      heal: healResult,
      autoTrader: autoTraderResult,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Health check failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
