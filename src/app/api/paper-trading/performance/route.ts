import { ensureAccount, getPerformance, getEquitySnapshots, resolveLtpMap, computeTotalEquity, saveEquitySnapshot } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const account = await ensureAccount();
    const ltpMap = await resolveLtpMap();
    const totalEquity = await computeTotalEquity(account.id, ltpMap);
    const perf = await getPerformance(account.id);
    const snapshots = await getEquitySnapshots(account.id);

    return Response.json({
      ...perf,
      totalEquity,
      totalReturnPct: ((totalEquity - account.starting_balance) / account.starting_balance) * 100,
      snapshots,
    });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to fetch performance" }, { status: 500 });
  }
}
