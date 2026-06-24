import { db } from "@/lib/db";

/**
 * Get today's date in YYYY-MM-DD format (Nepal timezone)
 */
export function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

/**
 * Get the target date, automatically falling back to the latest available date in the database
 */
export async function getTargetDateWithFallback(requestedDate?: string): Promise<{
  date: string;
  usedFallback: boolean;
}> {
  const targetDate = requestedDate || todayStr();
  
  if (requestedDate) {
    return { date: targetDate, usedFallback: false };
  }
  
  try {
    const result = await db.execute({
      sql: `SELECT tradeDate FROM floorsheet_trades WHERE tradeDate <= ? ORDER BY tradeDate DESC LIMIT 1`,
      args: [targetDate],
    });
    
    if (result.rows.length > 0) {
      const latestAvailableDate = String(result.rows[0].tradeDate);
      if (latestAvailableDate !== targetDate) {
        console.log(`[date-utils] No data for ${targetDate}, using: ${latestAvailableDate}`);
        return { date: latestAvailableDate, usedFallback: true };
      }
    }
  } catch (e) {
    console.log("[date-utils] Error:", (e as Error)?.message);
  }
  
  return { date: targetDate, usedFallback: false };
}
