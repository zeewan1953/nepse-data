import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  time: string;
};

// Demo headlines by source. In production, replace these fetches with RSS/REST APIs
// from MeroLagani, ShareSansar, NEPSE Alpha, SEBON, NEPSE Direct etc.
const SOURCES = [
  {
    name: "MeroLagani",
    headlines: [
      "NEPSE Index drops by 6 points in midday trading",
      "Commercial banks lead turnover on Tuesday",
      "Microfinance sector sees renewed buying interest",
      "IPO allotment results published for upcoming issue",
      "Market capitalization slips below Rs 3.4 trillion",
    ],
  },
  {
    name: "ShareSansar",
    headlines: [
      "Top gainers of the day: Hydro and insurance stocks",
      "Government bond yields impact stock market sentiment",
      "Quarterly results: Banks report mixed earnings",
      "Foreign investor participation remains low",
      "Rights shares of major commercial banks in focus",
    ],
  },
  {
    name: "NEPSE Alpha",
    headlines: [
      "Technical analysis: NEPSE tests 2,700 support",
      "Volume leaders: Top 10 actively traded stocks",
      "Breakout watch: Manufacturing stocks show momentum",
      "RSI scanner: Oversold conditions in insurance",
      "Daily market summary and broker activity",
    ],
  },
  {
    name: "SEBON",
    headlines: [
      "SEBON issues directive on mutual fund disclosures",
      "New securities registration guidelines released",
      "Board meeting to review capital market reforms",
      "Investor awareness program announced",
      "Regulatory updates for stock brokers and DPs",
    ],
  },
  {
    name: "NEPSE Direct",
    headlines: [
      "Floor sheet analysis: top buyers and sellers",
      "Market opens flat, hydro stocks gain traction",
      "Dividend announcements from listed companies",
      "Corporate actions: AGM and book closure dates",
      "Live trading updates and index movements",
    ],
  },
];

function buildDemoNews(): NewsItem[] {
  const now = new Date();
  const items: NewsItem[] = [];
  SOURCES.forEach((source) => {
    source.headlines.forEach((title, idx) => {
      const t = new Date(now.getTime() - idx * 600_000);
      items.push({
        id: `${source.name}-${idx}`,
        title,
        source: source.name,
        url: "#",
        time: t.toISOString(),
      });
    });
  });
  // Shuffle-ish by sorting on id hash
  return items.sort(() => Math.random() - 0.5).slice(0, 18);
}

export async function GET() {
  try {
    const news = buildDemoNews();
    return NextResponse.json({ news, updatedAt: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, news: [] }, { status: 502 });
  }
}
