import { NextRequest, NextResponse } from "next/server";
import { getIPOIssueById } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const issue = await getIPOIssueById(Number(id));
    if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(issue);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
