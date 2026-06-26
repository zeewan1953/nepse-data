import "server-only";
import { execute } from "@/lib/db";
import { getTradingDays, isTradingDay, todayStr } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type DataGap = {
  date: string;
  classification: "pending-recovery" | "permanently-missing" | "ambiguous-holiday";
};

export type DataGapsResponse = {
  checkedPeriod: { from: string; to: string };
  totalExpected: number;
  totalStored: number;
  gaps: DataGap[];
  storedDates: string[];
  generatedAt: string;
};

export async function GET() {
  const to = todayStr();
  const fromDate = new Date(Date.now() - 30 * 86400000);
  const from = fromDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

  // Expected trading days in the period
  const expectedDays = getTradingDays(from, to);

  // Actual stored dates in merolagani_broker_daily
  const result = await execute(
    "SELECT DISTINCT tradeDate FROM merolagani_broker_daily ORDER BY tradeDate ASC"
  );
  const storedDates = result.rows.map((r: any) => String(r.tradeDate));
  const storedSet = new Set(storedDates);

  // Find gaps and classify
  const gaps: DataGap[] = [];
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
  const twoDaysAgoStr = twoDaysAgo.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

  for (const day of expectedDays) {
    if (storedSet.has(day)) continue;

    if (!isTradingDay(day)) {
      gaps.push({ date: day, classification: "ambiguous-holiday" });
    } else if (day >= twoDaysAgoStr) {
      gaps.push({ date: day, classification: "pending-recovery" });
    } else {
      gaps.push({ date: day, classification: "permanently-missing" });
    }
  }

  return Response.json({
    checkedPeriod: { from, to },
    totalExpected: expectedDays.length,
    totalStored: storedDates.length,
    gaps,
    storedDates,
    generatedAt: new Date().toISOString(),
  } satisfies DataGapsResponse);
}
