import { runScanner } from "@/lib/broker_flow_engine";
import { runRealScanner } from "@/lib/broker_flow_real_engine";
import { hasRealData } from "@/lib/broker_flow_real_data";
import { DATA_VERSION } from "@/lib/broker_flow_sample_fixtures";
import { getBrokerFlowCache, saveBrokerFlowCache } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayStr();
  try {
    const real = await hasRealData(date);
    const section = `scanner:${real ? "real" : "sample"}:${DATA_VERSION}`;
    const cached = await getBrokerFlowCache(date, section);
    if (cached) return Response.json(cached);

    let result;
    let source: string;
    if (real) {
      result = await runRealScanner(date);
      source = "real";
    } else {
      result = runScanner(date);
      source = "sample";
    }
    const data = { date, ...result, source, generatedAt: Date.now() };
    await saveBrokerFlowCache(date, section, data);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Scanner failed" }, { status: 502 });
  }
}
