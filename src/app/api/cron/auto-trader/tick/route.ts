import { tickAutoTrader, isMarketHours, scheduleNextTick } from "@/lib/auto-trader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// waitUntil fallback - best effort only
let _waitUntil: ((p: Promise<any>) => void) | null = null;
try {
  // Dynamic import avoids build issue when @vercel/functions not installed locally
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _waitUntil = (globalThis as any).__waitUntil || null;
} catch {}

const SELF_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://nepse-data-sand.vercel.app";

async function selfRetry(delayMs = 180_000): Promise<void> {
  await new Promise((r) => setTimeout(r, delayMs));
  try {
    await fetch(`${SELF_URL}/api/cron/auto-trader/tick`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    // retry failed — next GitHub Actions tick will catch it
  }
}

export async function GET() {
  try {
    const result = await tickAutoTrader();

    // If market is still open, try self-scheduling as fallback via waitUntil
    if (isMarketHours() && _waitUntil) {
      _waitUntil(selfRetry(180_000));
    }

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Tick failed", ran: false }, { status: 500 });
  }
}
