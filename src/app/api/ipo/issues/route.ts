import { NextRequest, NextResponse } from "next/server";
import { getIPOIssues, getIPOIssueById } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "all";
    const id = searchParams.get("id");

    if (id) {
      const issue = await getIPOIssueById(Number(id));
      if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(issue);
    }

    const issues = await getIPOIssues(status);
    return NextResponse.json(issues);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
