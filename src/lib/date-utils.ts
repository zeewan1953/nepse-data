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

/**
 * Generate NEPSE trading days (Sunday-Thursday) between from and to, inclusive.
 * Filters out Friday, Saturday, and known Nepali holidays.
 */
const NEPSE_HOLIDAYS = new Set<string>([
  "2026-01-01", // New Year
  "2026-01-14", // Maghe Sankranti
  "2026-01-29", // Sonam Losar
  "2026-02-19", // Prajatantra Diwas
  "2026-03-08", // Maha Shivaratri
  "2026-03-20", // Fagu Purnima (Holi)
  "2026-04-14", // Nepali New Year (Baisakh 1)
  "2026-05-05", // Labour Day
  "2026-06-04", // Vaisakha Purnima / Buddha Jayanti
  "2026-07-07", // Shrawan 1 (Month start)
  "2026-08-23", // Janai Purnima / Gai Jatra
  "2026-08-28", // Shree Krishna Janmashtami
  "2026-09-18", // Indra Jatra
  "2026-09-20", // Ghatasthapana (Dashain start)
  "2026-09-29", // Fulpati
  "2026-10-01", // Dashain (Vijaya Dashami)
  "2026-10-02", // Dashain holiday
  "2026-10-16", // Tihar (Laxmi Puja)
  "2026-10-18", // Tihar (Bhai Tika)
  "2026-11-04", // Chhath Parwa
  "2026-11-21", // Nepal Sambat 1147
  "2026-12-09", // Waqf al-Araf
  "2026-12-10", // Eid-ul-Azha
  "2026-12-25", // Christmas
  "2026-12-31", // Year end
]);

export function isTradingDay(dateStr: string): boolean {
  if (NEPSE_HOLIDAYS.has(dateStr)) return false;
  const d = new Date(dateStr + "T12:00:00+05:45");
  const day = d.getUTCDay();
  if (day === 5 || day === 6) return false; // Friday=5, Saturday=6
  return true;
}

export function getTradingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const d = new Date(from + "T12:00:00+05:45");
  const end = new Date(to + "T12:00:00+05:45");
  while (d <= end) {
    const s = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    if (isTradingDay(s)) days.push(s);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Get the last N trading days up to and including endDate (or today).
 * Walks backwards skipping holidays/weekends.
 */
export function getLastNTradingDays(n: number, endDate?: string): string[] {
  const days: string[] = [];
  let d = new Date((endDate || todayStr()) + "T12:00:00+05:45");
  while (days.length < n) {
    const s = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    if (isTradingDay(s)) days.unshift(s);
    d.setDate(d.getDate() - 1);
  }
  return days;
}

export function prevTradingDay(dateStr: string): string {
  let d = new Date(dateStr + "T12:00:00+05:45");
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() - 1);
    const s = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    if (isTradingDay(s)) return s;
  }
  return dateStr;
}
