import { ensureAccount, getHoldings, resolveLtpMap, computeTotalEquity } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const account = await ensureAccount();
    const ltpMap = await resolveLtpMap();
    const holdings = await getHoldings(account.id);
    const totalEquity = await computeTotalEquity(account.id, ltpMap);
    const todayPnl = totalEquity - account.cash_balance - holdings.reduce((s, h) => s + h.quantity * h.avg_buy_price, 0);

    const enriched = holdings.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity,
      avgBuyPrice: h.avg_buy_price,
      currentLtp: ltpMap[h.symbol] ?? null,
      unrealizedPnl: ltpMap[h.symbol] != null
        ? ((ltpMap[h.symbol] - h.avg_buy_price) * h.quantity)
        : null,
      unrealizedPnlPct: ltpMap[h.symbol] != null
        ? ((ltpMap[h.symbol] - h.avg_buy_price) / h.avg_buy_price) * 100
        : null,
    }));

    return Response.json({
      cashBalance: account.cash_balance,
      totalEquity,
      totalReturnPct: ((totalEquity - account.starting_balance) / account.starting_balance) * 100,
      holdings: enriched,
    });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to fetch portfolio" }, { status: 500 });
  }
}
