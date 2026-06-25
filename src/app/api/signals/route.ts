import { buildSignalsFromLiveData, groupBySector } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { signals, source } = await buildSignalsFromLiveData();
    const bySector = groupBySector(signals);

    const sectors = [...bySector.entries()].map(([name, stocks]) => ({
      sector: name,
      total: stocks.length,
      buys: stocks.filter((s) => s.signal === "BUY").length,
      sells: stocks.filter((s) => s.signal === "SELL").length,
      neutrals: stocks.filter((s) => s.signal === "NEUTRAL").length,
      nulls: stocks.filter((s) => s.signal === null).length,
      topSignals: stocks.slice(0, 5),
    }));

    return Response.json({
      generatedAt: Date.now(),
      source,
      totalSignals: signals.length,
      sectors,
      signals: signals.slice(0, 100),
    });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Signal generation failed" }, { status: 500 });
  }
}
