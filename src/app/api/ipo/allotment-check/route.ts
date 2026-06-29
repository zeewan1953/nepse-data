import { NextRequest, NextResponse } from "next/server";
import { getIPOIssueById, checkAllotmentCache } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { issue_id, boid } = await req.json();
    if (!issue_id || !boid) {
      return NextResponse.json({ error: "issue_id and boid required" }, { status: 400 });
    }

    // Validate BOID format (16-digit CDSC account number)
    if (!/^\d{16}$/.test(String(boid))) {
      return NextResponse.json({ error: "Invalid BOID format" }, { status: 400 });
    }

    // Hash BOID immediately — never stored raw
    const salt = process.env.BOID_HASH_SALT || "nepse-axion-ipo-salt";
    const boidHash = crypto.createHash("sha256").update(String(boid) + salt).digest("hex");

    // Get issue for registrar link
    const issue = await getIPOIssueById(Number(issue_id));
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

    // Check cache
    const cached = await checkAllotmentCache(Number(issue_id), boidHash);
    if (cached) {
      return NextResponse.json({
        result_status: cached.result_status,
        allotted_units: cached.allotted_units,
        cached: true,
      });
    }

    // Degraded mode: link-out to registrar
    return NextResponse.json({
      result_status: "unavailable",
      message: "Live allotment lookup not yet available for this issue.",
      registrar_link: issue.source_url || null,
      registrar_name: issue.registrar_name || null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
