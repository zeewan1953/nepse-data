import { ensureAccount, placeOrder, getOrdersByStatus, resolveLtpMap, matchOrders } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, side, limitPrice, quantity } = body;
    if (!symbol || !side || !limitPrice || !quantity) {
      return Response.json({ error: "Missing required fields: symbol, side, limitPrice, quantity" }, { status: 400 });
    }
    const account = await ensureAccount();
    const result = await placeOrder(account.id, String(symbol).toUpperCase(), side, Number(limitPrice), Number(quantity));
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json(result.order);
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to place order" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const account = await ensureAccount();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "PENDING";
    const orders = await getOrdersByStatus(account.id, status);
    return Response.json({ orders });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to fetch orders" }, { status: 500 });
  }
}
