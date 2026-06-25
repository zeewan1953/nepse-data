import { getMonthlyPnL } from "@/lib/auto-trader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pnl = await getMonthlyPnL();
    return Response.json({ monthlyPnL: pnl });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 500 });
  }
}
