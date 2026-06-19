import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import { getMarketSession, getNPTNow } from "@/lib/market-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await cached("market-status", 10_000, () =>
      safeNepseCall(() => getNepse().getMarketStatus(), "Market Status"),
    );
    
    // Check if we got valid data
    if (status && typeof status === "object" && "isOpen" in status) {
      return Response.json(status);
    }
    
    // Fallback based on local market hours + holidays
    const session = getMarketSession(getNPTNow());
    const isOpen = session !== "closed";
    return Response.json({
      isOpen: isOpen ? "OPEN" : "CLOSE",
      session,
      asOf: new Date().toISOString(),
      source: "calculated",
    });
  } catch (e) {
    // Fallback based on local market hours + holidays
    const session = getMarketSession(getNPTNow());
    const isOpen = session !== "closed";
    return Response.json({
      isOpen: isOpen ? "OPEN" : "CLOSE",
      session,
      asOf: new Date().toISOString(),
      source: "calculated",
    });
  }
}
