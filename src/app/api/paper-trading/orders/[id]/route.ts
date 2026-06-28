import { cancelOrder } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ok = await cancelOrder(Number(id));
    if (!ok) return Response.json({ error: "Order not found or not pending" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to cancel order" }, { status: 500 });
  }
}
