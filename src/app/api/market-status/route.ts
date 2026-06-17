import { getNepse, cached, safeNepseCall } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Determine if market is open based on time (Nepal: UTC+5:45, Market: 11:00-15:00)
function isMarketHours(): boolean {
  const now = new Date();
  const nepalTime = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
  const day = nepalTime.getUTCDay();
  const hour = nepalTime.getUTCHours();
  const minute = nepalTime.getUTCMinutes();
  const timeMins = hour * 60 + minute;
  
  // Market open: Sun-Fri, 11:00-15:00 Nepal time
  const isWeekday = day >= 0 && day <= 5;
  const isMarketHours = timeMins >= 660 && timeMins <= 900;
  
  return isWeekday && isMarketHours;
}

export async function GET() {
  try {
    const status = await cached("market-status", 10_000, () =>
      safeNepseCall(() => getNepse().getMarketStatus(), "Market Status"),
    );
    
    // Check if we got valid data
    if (status && typeof status === "object" && "isOpen" in status) {
      return Response.json(status);
    }
    
    // Fallback based on market hours
    const isOpen = isMarketHours();
    return Response.json({
      isOpen: isOpen ? "OPEN" : "CLOSE",
      asOf: new Date().toISOString(),
      source: "calculated",
    });
  } catch (e) {
    // Fallback based on market hours
    const isOpen = isMarketHours();
    return Response.json({
      isOpen: isOpen ? "OPEN" : "CLOSE",
      asOf: new Date().toISOString(),
      source: "calculated",
    });
  }
}
