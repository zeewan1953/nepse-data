import { NextResponse } from "next/server";
import { getIPOIssues } from "@/lib/db";
import { isTradingDay } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const issues = await getIPOIssues("all");
    const events: {
      date: string; type: string; issue_id: number; company: string;
      event: string; status: string;
    }[] = [];

    for (const issue of issues) {
      if (issue.opening_date) {
        events.push({
          date: issue.opening_date, type: "opening", issue_id: issue.id,
          company: issue.company_name, event: "IPO Opens", status: issue.status,
        });
      }
      if (issue.closing_date) {
        events.push({
          date: issue.closing_date, type: "closing", issue_id: issue.id,
          company: issue.company_name, event: "IPO Closes", status: issue.status,
        });
      }
      if (issue.allotment_date) {
        const isTrading = isTradingDay(issue.allotment_date);
        events.push({
          date: issue.allotment_date, type: isTrading ? "allotment" : "allotment_est", issue_id: issue.id,
          company: issue.company_name, event: isTrading ? "Allotment" : "Allotment (est.)", status: issue.status,
        });
      }
      if (issue.listing_date) {
        events.push({
          date: issue.listing_date, type: "listing", issue_id: issue.id,
          company: issue.company_name, event: "Listing", status: issue.status,
        });
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
