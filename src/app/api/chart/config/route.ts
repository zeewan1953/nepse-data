import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    supported_resolutions: ["D"],
    exchanges: [
      { value: "NEPSE", name: "NEPSE", desc: "Nepal Stock Exchange" },
    ],
    symbols_types: [
      { name: "stock", value: "stock" },
    ],
    supports_search: true,
    supports_group_request: false,
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
  });
}
