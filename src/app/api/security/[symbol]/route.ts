import {
  getNepse,
  cached,
  resolveSecurityId,
  getPriceHistoryById,
  getSecurityDetailsById,
} from "@/lib/nepse";
import type { SecurityDetails, SecurityPriceVolumeHistory } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full detail for one company: profile/details, price-volume history (for the
// candlestick chart + indicators) and live market depth (buy/sell order book).
// Resolves the security id from multiple feeds so symbols missing from the
// keymap still work, and returns a clean 404 for truly unknown symbols.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  try {
    const data = await cached(`security:${symbol}`, 5_000, async () => {
      const nepse = getNepse();
      const id = await resolveSecurityId(symbol);
      if (!id) return null;
      const [details, history, depth] = await Promise.all([
        getSecurityDetailsById(id).catch(() => null) as Promise<SecurityDetails | null>,
        getPriceHistoryById(id, 500).catch(() => null) as Promise<SecurityPriceVolumeHistory | null>,
        nepse.getMarketDepth(symbol).catch(() => null),
      ]);
      return { symbol, id, details, history, depth };
    });

    if (!data) {
      return Response.json(
        { error: `Symbol "${symbol}" not found on NEPSE (it may be delisted or renamed).` },
        { status: 404 },
      );
    }
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load security" },
      { status: 502 },
    );
  }
}
