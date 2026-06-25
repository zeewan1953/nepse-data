import { getState } from "@/lib/auto-trader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getState();
    return Response.json(state);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 500 });
  }
}
