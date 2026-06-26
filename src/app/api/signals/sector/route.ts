import { NextRequest } from "next/server";
import { buildSignalsFromLiveData, groupBySector } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sectorParam = req.nextUrl.searchParams.get("sector")?.toUpperCase();
    const { signals, source } = await buildSignalsFromLiveData();
    const bySector = groupBySector(signals);

    if (sectorParam) {
      const filtered = [...bySector.entries()]
        .filter(([name]) => name.toUpperCase() === sectorParam || name.toUpperCase().includes(sectorParam))
        .flatMap(([, stocks]) => stocks);

      return Response.json({
        generatedAt: Date.now(),
        source,
        sector: sectorParam,
        total: filtered.length,
        signals: filtered,
      });
    }

    const sectors = [...bySector.entries()].map(([name, stocks]) => ({
      sector: name,
      total: stocks.length,
      buys: stocks.filter((s) => s.signal === "BUY").length,
      sells: stocks.filter((s) => s.signal === "SELL").length,
      neutrals: stocks.filter((s) => s.signal === "NEUTRAL").length,
      nulls: stocks.filter((s) => s.signal === null).length,
    }));

    return Response.json({
      generatedAt: Date.now(),
      source,
      totalSignals: signals.length,
      sectors,
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Signal generation failed" }, { status: 500 });
  }
}
