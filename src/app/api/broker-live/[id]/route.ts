import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 500;
const MAX_PAGES = 50;

// Fetch all trades for a broker on one side
async function fetchSide(broker: number, side: "buy" | "sell"): Promise<FloorSheetItem[]> {
  const nepse = getNepse();
  const opt = side === "buy" ? { buyerBroker: broker } : { sellerBroker: broker };
  const first = await safeNepseCall(
    () => nepse.getFloorSheet({ ...opt, page: 0, size: SIZE }) as Promise<FloorSheet>,
    `Broker-live ${broker} ${side}`
  );
  const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
  const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    const res = await Promise.all(
      batch.map((p) => safeNepseCall(
        () => nepse.getFloorSheet({ ...opt, page: p, size: SIZE }) as Promise<FloorSheet>,
        `Broker-live ${broker} ${side} page ${p}`
      ).catch(() => null)),
    );
    for (const r of res) if (r) items.push(...((r as FloorSheet).floorsheets?.content ?? []));
  }
  return items;
}

// Fetch live prices from MeroLagani (fast JSON API)
async function fetchLivePrices(): Promise<Map<string, { ltp: number; change: number; volume: number }>> {
  const m = new Map<string, { ltp: number; change: number; volume: number }>();
  try {
    const mero = await fetchMeroLaganiSummary();
    if (mero?.stock?.detail?.length) {
      for (const s of mero.stock.detail) {
        const pc = calcMeroPercent(s);
        m.set(s.s, { ltp: s.lp, change: pc, volume: s.q });
      }
    }
  } catch { /* live prices optional */ }
  return m;
}

type StockRow = {
  symbol: string;
  name: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
  ltp: number;
  change: number;
  volume: number;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const broker = Number(id);
  if (!broker || broker < 1 || broker > 999) {
    return Response.json({ error: "Invalid broker number (1-999)" }, { status: 400 });
  }

  try {
    // Cache broker trades for 3 seconds (live feel), live prices also 3s
    const data = await cached(`broker-live:${broker}`, 3_000, async () => {
      // Fetch broker trades and live prices in parallel
      const [buys, sells, liveMap] = await Promise.all([
        fetchSide(broker, "buy"),
        fetchSide(broker, "sell"),
        fetchLivePrices(),
      ]);

      // Aggregate broker trades per stock
      const map = new Map<string, { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>();
      const get = (t: FloorSheetItem) =>
        map.get(t.stockSymbol) ?? { symbol: t.stockSymbol, name: t.securityName, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      for (const t of buys) {
        const r = get(t); r.buyQty += t.contractQuantity; r.buyAmt += t.contractAmount; map.set(t.stockSymbol, r);
      }
      for (const t of sells) {
        const r = get(t); r.sellQty += t.contractQuantity; r.sellAmt += t.contractAmount; map.set(t.stockSymbol, r);
      }

      // Merge with live prices
      const stocks: StockRow[] = [...map.values()].map((r) => {
        const live = liveMap.get(r.symbol);
        return {
          ...r,
          netQty: r.buyQty - r.sellQty,
          netAmt: r.buyAmt - r.sellAmt,
          ltp: live?.ltp ?? 0,
          change: live?.change ?? 0,
          volume: live?.volume ?? 0,
        };
      }).sort((a, b) => b.netAmt - a.netAmt);

      const totals = stocks.reduce(
        (a, s) => ({ buyAmt: a.buyAmt + s.buyAmt, sellAmt: a.sellAmt + s.sellAmt }),
        { buyAmt: 0, sellAmt: 0 },
      );

      // Top accumulation (broker buying + stock is up)
      const accumulation = stocks.filter((s) => s.netQty > 0 && s.change > 0).sort((a, b) => b.netAmt - a.netAmt).slice(0, 5);
      // Top distribution (broker selling + stock is down)
      const distribution = stocks.filter((s) => s.netQty < 0 && s.change < 0).sort((a, b) => a.netAmt - b.netAmt).slice(0, 5);

      return {
        broker,
        stocks,
        totals: { ...totals, netAmt: totals.buyAmt - totals.sellAmt },
        accumulation,
        distribution,
        liveCount: liveMap.size,
        asOf: new Date().toISOString(),
      };
    });

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to load broker" }, { status: 502 });
  }
}
