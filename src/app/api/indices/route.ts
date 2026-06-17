import { getNepse, cached, safeNepseCall } from "@/lib/nepse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_SUB_INDICES = [
  { index: "Banking Sub Index", currentValue: 1432.27, change: -2.68, perChange: -0.18 },
  { index: "Development Bank Index", currentValue: 5762.59, change: 0.46, perChange: 0 },
  { index: "Finance Index", currentValue: 2443.76, change: 3.44, perChange: 0.14 },
  { index: "Hotels And Tourism Index", currentValue: 7661.66, change: -49.81, perChange: -0.64 },
  { index: "Hydro Power Index", currentValue: 3795.54, change: 11.54, perChange: 0.3 },
  { index: "Life Insurance", currentValue: 12378.07, change: -8.85, perChange: -0.07 },
  { index: "Manufacturing And Processing", currentValue: 11048.38, change: 56.06, perChange: 0.51 },
  { index: "Microfinance Index", currentValue: 4727.86, change: -1.98, perChange: -0.04 },
  { index: "Mutual Fund", currentValue: 21.84, change: -0.01, perChange: -0.05 },
  { index: "Non-Life Insurance", currentValue: 11140.84, change: -62.5, perChange: -0.55 },
  { index: "Others Index", currentValue: 2003, change: -1.75, perChange: -0.08 },
  { index: "Trading Index", currentValue: 3357.97, change: -20.46, perChange: -0.6 },
];

async function fetchIndicesFromVercel(): Promise<{ index: unknown[]; subIndices: unknown[]; source: string } | null> {
  try {
    const res = await fetch("https://nepse-data-sand.vercel.app/api/indices", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const nepseIdx = data.index?.find((i: { index: string }) => i.index === "NEPSE Index");
    const cv = (nepseIdx as Record<string, unknown>)?.currentValue as number;
    const cl = (nepseIdx as Record<string, unknown>)?.close as number;
    if (nepseIdx && (cv > 2100 || cl > 2100)) {
      return { ...data, source: "vercel" };
    }
  } catch { /* Vercel fetch failed */ }
  return null;
}

export async function GET() {
  // 1. Try direct NEPSE API
  try {
    const nepse = getNepse();
    const [indexData, subIndices] = await cached("indices", 8_000, async () =>
      Promise.all([
        safeNepseCall(() => nepse.getNepseIndex(), "NEPSE Index"),
        safeNepseCall(() => nepse.getNepseSubIndices(), "Sub Indices"),
      ]),
    );

    const nepseIndex = Array.isArray(indexData)
      ? indexData.find((i) => i.index === "NEPSE Index")
      : indexData;

    const validIndex = nepseIndex && typeof nepseIndex === "object" && ("close" in nepseIndex || "currentValue" in nepseIndex);
    const validSubs = Array.isArray(subIndices) && subIndices.length > 0;

    if (validIndex) {
      return Response.json({
        index: [nepseIndex],
        subIndices: validSubs ? subIndices : FALLBACK_SUB_INDICES,
        source: "nepse",
      });
    }
  } catch { /* NEPSE failed */ }

  // 2. Try Vercel fallback
  const vercelIndices = await fetchIndicesFromVercel();
  if (vercelIndices) {
    return Response.json(vercelIndices);
  }

  // 3. Static fallback with last known real values
  const FALLBACK_INDEX = {
    index: "NEPSE Index",
    close: 2705.45,
    currentValue: 2705.53,
    change: 0.08,
    perChange: 0,
    high: 2714.67,
    low: 2696.82,
    previousClose: 2705.54,
  };
  return Response.json({
    index: [FALLBACK_INDEX],
    subIndices: FALLBACK_SUB_INDICES,
    source: "fallback",
  });
}
