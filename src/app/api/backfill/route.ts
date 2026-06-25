import { getTradingDays, todayStr } from "@/lib/date-utils";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { getBrokerDailyHash, upsertBrokerDailySummary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PER_DAY_DELAY_MS = 1500;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  })();
  const to = searchParams.get("to") || todayStr();

  try {
    const tradingDays = getTradingDays(from, to);
    const results: Array<{ date: string; status: string; brokers?: number; error?: string }> = [];
    let filled = 0;
    let skipped = 0;
    let failed = 0;

    for (const day of tradingDays) {
      const existing = await getBrokerDailyHash(day);
      if (existing) {
        skipped++;
        results.push({ date: day, status: "already_cached" });
        continue;
      }

      // Rate limit between fetches
      await sleep(PER_DAY_DELAY_MS + Math.random() * 1000);

      try {
        const mero = await fetchMeroLaganiSummary();
        if (!mero?.broker?.detail?.length) {
          failed++;
          results.push({ date: day, status: "no_data" });
          continue;
        }

        const meroDate = (mero.broker.date || mero.overall?.d || day).slice(0, 10).replace(/\//g, "-");
        const brokers = mero.broker.detail.map((b: any) => ({
          brokerCode: b.b,
          brokerName: b.n || "",
          purchaseAmt: Number(b.p) || 0,
          sellAmt: Number(b.s) || 0,
          netAmt: Number(b.m) || 0,
          totalAmt: Number(b.t) || 0,
        }));

        const saved = await upsertBrokerDailySummary(meroDate, brokers);
        if (saved > 0) {
          filled++;
          results.push({ date: day, status: "filled", brokers: saved, meroDate } as any);
        } else {
          failed++;
          results.push({ date: day, status: "save_failed" });
        }
      } catch (e) {
        failed++;
        results.push({ date: day, status: "error", error: (e as Error).message });
      }
    }

    return Response.json({
      from,
      to,
      total_trading_days: tradingDays.length,
      filled,
      skipped,
      failed,
      note: "MeroLagani returns only current day data; historical fills require NEPSE-direct worker",
      results,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Backfill failed" }, { status: 502 });
  }
}