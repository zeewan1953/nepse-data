import { processChatMessage } from "@/lib/chat-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message required" }, { status: 400 });
    }

    const result = await processChatMessage(message);
    return Response.json(result);
  } catch (e) {
    return Response.json({ type: "error", title: "Chat Error", content: (e as Error)?.message || "Unknown" }, { status: 500 });
  }
}
