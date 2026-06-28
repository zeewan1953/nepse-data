import { ensureAccount, getTradeHistory } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const account = await ensureAccount();
    const trades = await getTradeHistory(account.id);
    return Response.json({ trades });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to fetch history" }, { status: 500 });
  }
}
