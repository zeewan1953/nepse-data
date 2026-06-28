import { ensureAccount, resetAccount } from "@/lib/paper-trading/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { confirmation } = body;
    if (!confirmation) {
      return Response.json({ error: "Confirmation required. Set confirmation: true to proceed." }, { status: 400 });
    }
    const account = await ensureAccount();
    const result = await resetAccount(account.id, true);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true, message: "Account reset. Holdings cleared, orders cancelled, cash restored." });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Failed to reset account" }, { status: 500 });
  }
}
