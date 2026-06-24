/**
 * NEPSE Market Hours & Holiday Calendar
 *
 * Market sessions (NPT – Asia/Kathmandu):
 *   Pre-open : 10:30 AM – 10:45 AM
 *   Regular  : 11:00 AM –  3:00 PM
 *   Days     : Sunday – Friday  (Saturday closed)
 *
 * Nepal public holidays are fixed annually by the government.
 * The list below covers 2024-2027 major NEPSE holidays.
 */

/* ── Nepal public holidays (month-day) that close NEPSE ── */
const FIXED_HOLIDAYS: Set<string> = new Set([
  // ── National / Cultural ──
  "01-11", // Prithvi Jayanti (Jan 11)
  "01-15", // Maghe Sankranti (Jan 15)
  "01-29", // Martyr's Day (Jan 29)
  "02-19", // Prajatantra Diwas (Feb 19)
  "02-26", // Maha Shivaratri (Feb 26) – approximate
  "03-08", // Nari Diwas / Int'l Women's Day (Mar 8)
  "03-14", // Holi / Fagu Purnima (Mar 14)
  "03-28", // Ghode Jatra (Mar 28) – approximate
  "04-14", // Naya Barsa / Nepali New Year (Apr 14)
  "04-17", // Ram Navami (Apr 17)
  "05-01", // Majdur Diwas / Labour Day (May 1)
  "05-12", // Buddha Jayanti (May 12) – approximate
  "05-29", // Ganatantra Diwas / Republic Day (May 29)
  "08-15", // Janai Purnima / Raksha Bandhan (Aug 15)
  "08-26", // Krishna Janmashtami (Aug 26) – approximate
  "09-17", // Indra Jatra (Sep 17) – approximate
  "09-19", // Constitution Day (Sep 19)
  "10-02", // Phulpati / Dashain (Oct 2) – approximate
  "10-03", // Maha Ashtami (Oct 3)
  "10-04", // Maha Nawami (Oct 4)
  "10-05", // Bijaya Dashami (Oct 5)
  "10-06", // Dashain Holiday (Oct 6)
  "10-20", // Laxmi Puja / Tihar (Oct 20) – approximate
  "10-21", // Tihar Holiday (Oct 21)
  "10-22", // Tihar Holiday (Oct 22)
  "10-23", // Govardhan Puja (Oct 23)
  "10-24", // Bhai Tika (Oct 24)
  "11-08", // Chhath Puja (Nov 8) – approximate
  "11-15", // Guru Nanak Jayanti (Nov 15) – approximate
  "12-30", // Udhauli Parva (Dec 30)
  "12-25", // Christmas (Dec 25)
]);

/* ── Specific date holidays (year-month-day) for accuracy ── */
const EXACT_HOLIDAYS: Set<string> = new Set([
  // 2025
  "2025-01-11", "2025-01-15", "2025-01-29",
  "2025-02-19", "2025-02-26",
  "2025-03-08", "2025-03-14", "2025-03-28",
  "2025-04-14", "2025-04-17",
  "2025-05-01", "2025-05-12", "2025-05-29",
  "2025-08-15", "2025-08-26",
  "2025-09-17", "2025-09-19",
  "2025-10-02", "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-06",
  "2025-10-20", "2025-10-21", "2025-10-22", "2025-10-23", "2025-10-24",
  "2025-11-08", "2025-11-15",
  "2025-12-25", "2025-12-30",
  // 2026
  "2026-01-11", "2026-01-15", "2026-01-29",
  "2026-02-19", "2026-02-26",
  "2026-03-08", "2026-03-14", "2026-03-28",
  "2026-04-14", "2026-04-17",
  "2026-05-01", "2026-05-12", "2026-05-29",
  "2026-08-15", "2026-08-26",
  "2026-09-17", "2026-09-19",
  "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
  "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
  "2026-11-08", "2026-11-15",
  "2026-12-25", "2026-12-30",
  // 2027
  "2027-01-11", "2027-01-15", "2027-01-29",
  "2027-02-19", "2027-02-26",
  "2027-03-08", "2027-03-14", "2027-03-28",
  "2027-04-14", "2027-04-17",
  "2027-05-01", "2027-05-12", "2027-05-29",
  "2027-08-15", "2027-08-26",
  "2027-09-17", "2027-09-19",
  "2027-10-02", "2027-10-03", "2027-10-04", "2027-10-05", "2027-10-06",
  "2027-10-20", "2027-10-21", "2027-10-22", "2027-10-23", "2027-10-24",
  "2027-11-08", "2027-11-15",
  "2027-12-25", "2027-12-30",
]);

/** Get current Nepal time as a Date object */
export function getNPTNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
}

/** Check if a date is a Nepal public holiday */
export function isNepalHoliday(nptDate: Date): boolean {
  const y = nptDate.getFullYear();
  const m = String(nptDate.getMonth() + 1).padStart(2, "0");
  const d = String(nptDate.getDate()).padStart(2, "0");

  // Check exact date first (year-specific)
  if (EXACT_HOLIDAYS.has(`${y}-${m}-${d}`)) return true;
  // Fallback to month-day pattern
  if (FIXED_HOLIDAYS.has(`${m}-${d}`)) return true;

  return false;
}

/** Check if Saturday (NPT) — market closed all day */
export function isSaturday(nptDate: Date): boolean {
  return nptDate.getDay() === 6; // 6 = Saturday
}

/**
 * Returns market session type:
 * - "pre-open"  : 10:30 – 10:45 NPT
 * - "open"      : 11:00 – 15:00 NPT
 * - "closed"    : everything else (including Saturday & holidays)
 */
export function getMarketSession(nptDate?: Date): "pre-open" | "open" | "closed" {
  const npt = nptDate ?? getNPTNow();

  // Saturday = always closed
  if (isSaturday(npt)) return "closed";

  // Holiday = closed
  if (isNepalHoliday(npt)) return "closed";

  const h = npt.getHours();
  const m = npt.getMinutes();
  const mins = h * 60 + m;

  // Pre-open: 10:30 (630) to 10:45 (645)
  if (mins >= 630 && mins < 645) return "pre-open";

  // Regular: 11:00 (660) to 15:00 (900)
  if (mins >= 660 && mins < 900) return "open";

  return "closed";
}

/** Simple boolean: is market active (pre-open OR regular session)? */
export function isNepseMarketOpen(nptDate?: Date): boolean {
  const session = getMarketSession(nptDate);
  return session === "pre-open" || session === "open";
}

/**
 * Returns the default trade date for the broker analysis page:
 * - If current NPT time < 3:00 PM → yesterday (floorsheet not yet finalized)
 * - If current NPT time >= 3:00 PM → today (post-market, data should be available)
 * Returns YYYY-MM-DD string.
 */
export function getDefaultTradeDate(): string {
  const npt = getNPTNow();
  const h = npt.getHours();
  const m = npt.getMinutes();
  const mins = h * 60 + m;

  // After 3PM NPT → show today
  if (mins >= 900) return dateToStr(npt);

  // Before 3PM → show yesterday
  const yesterday = new Date(npt);
  yesterday.setDate(yesterday.getDate() - 1);
  return dateToStr(yesterday);
}

/** Format a Date as YYYY-MM-DD */
function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get human-readable market status label */
export function getMarketStatusLabel(nptDate?: Date): { label: string; color: string } {
  const session = getMarketSession(nptDate);
  switch (session) {
    case "pre-open":
      return { label: "Pre-Open", color: "#e67e22" };
    case "open":
      return { label: "Live", color: "#1a8a3a" };
    default:
      return { label: "Closed", color: "#999" };
  }
}
