import "server-only";
import { db, getBrokerDailySummary, getLatestMeroBrokerDate } from "@/lib/db";
import { todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Broker summary — reads ONLY from database, never from external APIs.
// Returns today's data if available, otherwise the most recent stored date.

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedDate = url.searchParams.get("date") || undefined;
    const today = todayStr();

    let targetDate = requestedDate || today;
    let usedFallback = false;

    // If no data for requested date, fall back to latest stored
    if (!requestedDate) {
      const latest = await getLatestMeroBrokerDate();
      if (latest && latest !== today) {
        targetDate = latest;
        usedFallback = true;
      }
    }

    const brokers = await getBrokerDailySummary(targetDate);

    if (brokers.length === 0 && !requestedDate) {
      // Try previous trading day if today is empty
      const latest = await getLatestMeroBrokerDate();
      if (latest) {
        targetDate = latest;
        return Response.json({
          date: targetDate,
          usedFallback: true,
          brokers: await getBrokerDailySummary(targetDate),
          source: "database",
        });
      }
    }

    const totalPurchase = brokers.reduce((s, b) => s + b.buyAmt, 0);
    const totalSell = brokers.reduce((s, b) => s + b.sellAmt, 0);
    const totalNet = brokers.reduce((s, b) => s + b.netAmt, 0);

    return Response.json({
      date: targetDate,
      usedFallback,
      brokers,
      totals: {
        purchase: totalPurchase,
        sell: totalSell,
        net: totalNet,
      },
      source: "database",
      brokerCount: brokers.length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to load broker summary" }, { status: 500 });
  }
}
