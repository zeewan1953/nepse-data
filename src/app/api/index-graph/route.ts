import { getNepse, cached, safeNepseCall } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Synthetic intraday fallback when nepalstock.com.np is unreachable ───
function generateSyntheticGraph(currentValue: number, points = 120): [number, number][] {
  const now = Math.floor(Date.now() / 1000);
  const interval = 60; // 1-minute points
  const start = now - points * interval;
  const open = currentValue * (1 - (Math.random() - 0.5) * 0.004);
  const out: [number, number][] = [];
  let price = open;
  for (let i = 0; i < points; i++) {
    const t = start + i * interval;
    // Mean-reverting random walk toward currentValue
    const drift = (currentValue - price) * 0.02;
    const noise = (Math.random() - 0.5) * currentValue * 0.002;
    price = Math.max(price * 0.995, price + drift + noise);
    out.push([t, Math.round(price * 100) / 100]);
  }
  // Force last point to current value
  out.push([now, currentValue]);
  return out;
}

async function getIndexValue(): Promise<number> {
  // Try Vercel fallback for real value
  try {
    const res = await fetch("https://nepse-data-sand.vercel.app/api/indices", {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      const nepseIdx = data.index?.find((i: { index: string }) => i.index === "NEPSE Index");
      const cv = nepseIdx?.currentValue ?? nepseIdx?.close;
      if (typeof cv === "number" && cv > 1000) return cv;
    }
  } catch { /* vercel failed */ }
  // Last known static value
  return 2700.47;
}

export async function GET() {
  // 1. Try real NEPSE intraday graph
  try {
    const points = await cached("index-graph", 15_000, () =>
      safeNepseCall(() => getNepse().getNepseIndexDailyGraph(), "Index graph"),
    );
    if (Array.isArray(points) && points.length >= 2) {
      return Response.json({ points, source: "nepse" });
    }
  } catch { /* NEPSE unreachable */ }

  // 2. Synthetic fallback using current index value
  try {
    const currentValue = await cached("index-value-fallback", 30_000, getIndexValue);
    const points = generateSyntheticGraph(currentValue);
    return Response.json({ points, source: "synthetic" });
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load index graph" },
      { status: 502 },
    );
  }
}
