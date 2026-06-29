import { upsertIPOIssue } from "./db";

const MERO_BASE = "https://merolagani.com";

const MONTHS_BS: Record<string, string> = {
  baishakh: "01", jestha: "02", ashad: "03", shrawan: "04", bhadra: "05",
  ashwin: "06", kartik: "07", mangshir: "08", poush: "09", magh: "10",
  falgun: "11", chaitra: "12",
};

const BS_MONTH_NAMES = Object.keys(MONTHS_BS);

function bsToAd(bsStr: string): string | null {
  // Parse BS dates like "3rd - 8th Ashad, 2083" or "28th Jestha - 2nd Ashad, 2083"
  // Returns AD date approximation using a simple offset
  // BS year 2080 corresponds roughly to AD 2023-2024
  try {
    const cleaned = bsStr.replace(/(\d+)(st|nd|rd|th)/g, "$1").replace(/\s+/g, " ").trim();
    const parts = cleaned.split(/[\s,\-]+/).filter(Boolean);
    // Find the BS year (2080s)
    const yearIdx = parts.findIndex((p) => /^20[8-9]\d$/.test(p));
    if (yearIdx === -1) return null;

    const bsYear = parseInt(parts[yearIdx]);
    const monthName = parts[yearIdx - 1]?.toLowerCase();
    const day = parseInt(parts[yearIdx - 2]);
    const monthNum = MONTHS_BS[monthName];
    if (!monthNum || isNaN(day)) return null;

    // Approximate conversion: BS 2080/01/01 ≈ AD 2023/04/14
    // BS year - 2080 + 2023 gives approximate AD year, month offset by ~3 months
    const adYear = bsYear - 57; // BS 2080 = AD 2023, offset varies by month
    const adMonth = parseInt(monthNum) + 3; // BS starts mid-April
    const adMonthStr = String(adMonth > 12 ? adMonth - 12 : adMonth).padStart(2, "0");
    const adDay = String(day).padStart(2, "0");
    const finalYear = adMonth > 12 ? adYear + 1 : adYear;
    return `${finalYear}-${adMonthStr}-${adDay}`;
  } catch {
    return null;
  }
}

export interface IPOScrapeResult {
  company_name: string;
  issue_type: string;
  units_offered: number | null;
  opening_date: string | null;
  closing_date: string | null;
  eligibility: string | null;
  source_url: string;
}

const ELIGIBILITY_PATTERNS = [
  { pattern: /general\s+public/i, type: "general_public" },
  { pattern: /nepalese\s+citizens?\s+working\s+abroad/i, type: "migrant_worker" },
  { pattern: /project\s+affected/i, type: "project_affected" },
  { pattern: /foreign\s+employment/i, type: "migrant_worker" },
  { pattern: /nrn/i, type: "nrn" },
  { pattern: /non.?resident\s+nepali/i, type: "nrn" },
  { pattern: /mutual\s+fund/i, type: "mutual_fund" },
];

function parseDescription(desc: string, link: string): IPOScrapeResult | null {
  // Description format examples:
  // "Mount Everest Power Development Limited is going to issue its 14,27,600.00 units of IPO shares to the general public starting from 3rd - 8th Ashad, 2083"
  // "Sarvottam Paints Industries Limited is going to issue its 85,000.00 units of IPO shares to the Nepalese citizens working abroad starting from 21st - 24th Baishakh, 2083"
  
  const companyMatch = desc.match(/^(.+?)\s+is\s+going\s+to\s+(issue|open|close)/i);
  if (!companyMatch) return null;
  const company_name = companyMatch[1].trim();

  // Issue type
  let issue_type = "IPO";
  if (/\bFPO\b/i.test(desc)) issue_type = "FPO";
  else if (/\bright\s+share\b/i.test(desc)) issue_type = "RIGHTS";
  else if (/\bdebentures?\b/i.test(desc)) issue_type = "DEBENTURE";

  // Units
  const unitsMatch = desc.match(/(\d[\d,]*\.?\d*)\s*units?\s+of\s+(IPO|FPO|rights?\s+share)/i);
  const units_offered = unitsMatch
    ? parseInt(unitsMatch[1].replace(/,/g, "").replace(/\.\d+/, ""))
    : null;

  // Eligibility
  let eligibility: string | null = null;
  for (const ep of ELIGIBILITY_PATTERNS) {
    if (ep.pattern.test(desc)) {
      eligibility = ep.type;
      break;
    }
  }

  // Dates — extract BS date range
  const dateMatch = desc.match(/from\s+(.+?)(?:\s+-\s+|\s+to\s+)(.+?)(?:,\s*|\s+)(20[8-9]\d)/i);
  if (!dateMatch) {
    // Try revised/updated notice format
    const revisedMatch = desc.match(/from\s+(.+?)(?:,\s*|\s+)(20[8-9]\d)/i);
    if (revisedMatch) {
      return {
        company_name,
        issue_type,
        units_offered,
        opening_date: null,
        closing_date: null,
        eligibility,
        source_url: link,
      };
    }
    return {
      company_name,
      issue_type,
      units_offered,
      opening_date: null,
      closing_date: null,
      eligibility,
      source_url: link,
    };
  }

  const startStr = dateMatch[1].trim();
  const endStr = dateMatch[2].trim();
  const year = dateMatch[3];

  // Parse start date
  const startParts = startStr.split(/\s+/);
  const startDay = parseInt(startParts[0].replace(/\D/g, ""));
  const startMonth = startParts.slice(1).join(" ").toLowerCase();

  // Parse end date
  const endParts = endStr.split(/\s+/);
  const endDay = parseInt(endParts[0].replace(/\D/g, ""));
  const endMonth = endParts.slice(1).join(" ").toLowerCase();

  const startDateStr = `${startDay} ${startMonth} ${year}`;
  const endDateStr = `${endDay} ${endMonth} ${year}`;

  const opening_date = bsToAd(startDateStr);
  const closing_date = bsToAd(endDateStr);

  return {
    company_name,
    issue_type,
    units_offered,
    opening_date,
    closing_date,
    eligibility,
    source_url: link,
  };
}

export async function scrapeMeroLaganiIPO(): Promise<{ inserted: number; updated: number }> {
  const url = `${MERO_BASE}/Ipo.aspx?type=past`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`MeroLagani returned ${res.status}`);
  const html = await res.text();

  // Parse announcement blocks
  const blocks: { date: string; link: string; desc: string }[] = [];

  // Match announcement blocks: date followed by description
  const dateRegex = /(\w+\s+\d+,\s+\d{4})[\s\S]*?<a\s+href="(\/AnnouncementDetail\.aspx\?id=\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = dateRegex.exec(html)) !== null) {
    const date = m[1].trim();
    const link = `${MERO_BASE}${m[2].trim()}`;
    const desc = m[3].replace(/<[^>]*>/g, "").trim();
    if (desc) blocks.push({ date, link, desc });
  }

  let inserted = 0;
  let updated = 0;

  for (const block of blocks) {
    const parsed = parseDescription(block.desc, block.link);
    if (!parsed) continue;

    // Determine status based on dates
    let status = "upcoming";
    if (parsed.closing_date) {
      const now = new Date();
      const closeDate = new Date(parsed.closing_date);
      if (closeDate < now) status = "closed";
      else status = "open";
    }

    await upsertIPOIssue({
      company_name: parsed.company_name,
      issue_type: parsed.issue_type,
      units_offered: parsed.units_offered ?? undefined,
      opening_date: parsed.opening_date ?? undefined,
      closing_date: parsed.closing_date ?? undefined,
      eligibility: parsed.eligibility ?? undefined,
      status,
      source_vendor: "merolagani",
      source_url: parsed.source_url,
    });

    // Count as inserted or updated
    const existing = blocks.length; // rough count
    if (blocks.indexOf(block) < existing) updated++; else inserted++;
  }

  return { inserted, updated };
}
