import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 500;
const MAX_PAGES = 50; // a single broker's trades fit in far fewer pages than the whole floorsheet

// All trades for a broker on one side (buyer or seller), across pages.
async function fetchSide(broker: number, side: "buy" | "sell"): Promise<FloorSheetItem[]> {
  const nepse = getNepse();
  const opt = side === "buy" ? { buyerBroker: broker } : { sellerBroker: broker };
  const first = await safeNepseCall(
    () => nepse.getFloorSheet({ ...opt, page: 0, size: SIZE }) as Promise<FloorSheet>,
    `Broker ${broker} ${side} data`
  );
  const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
  const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    const res = await Promise.all(
      batch.map((p) => safeNepseCall(
        () => nepse.getFloorSheet({ ...opt, page: p, size: SIZE }) as Promise<FloorSheet>,
        `Broker ${broker} ${side} page ${p}`
      ).catch(() => null)),
    );
    for (const r of res) if (r) items.push(...((r as FloorSheet).floorsheets?.content ?? []));
  }
  return items;
}

type Row = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const broker = Number(id);
  if (!broker) return Response.json({ error: "Invalid broker number" }, { status: 400 });
  try {
    const data = await cached(`broker:${broker}`, 30_000, async () => {
      const [buys, sells] = await Promise.all([fetchSide(broker, "buy"), fetchSide(broker, "sell")]);
      const map = new Map<string, Row>();
      const get = (t: FloorSheetItem) =>
        map.get(t.stockSymbol) ?? { symbol: t.stockSymbol, name: t.securityName, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      for (const t of buys) {
        const r = get(t);
        r.buyQty += t.contractQuantity;
        r.buyAmt += t.contractAmount;
        map.set(t.stockSymbol, r);
      }
      for (const t of sells) {
        const r = get(t);
        r.sellQty += t.contractQuantity;
        r.sellAmt += t.contractAmount;
        map.set(t.stockSymbol, r);
      }
      const stocks = [...map.values()]
        .map((r) => ({ ...r, netQty: r.buyQty - r.sellQty, netAmt: r.buyAmt - r.sellAmt }))
        .sort((a, b) => b.netAmt - a.netAmt);
      const totals = stocks.reduce(
        (a, s) => ({ buyAmt: a.buyAmt + s.buyAmt, sellAmt: a.sellAmt + s.sellAmt }),
        { buyAmt: 0, sellAmt: 0 },
      );
      return { broker, stocks, totals: { ...totals, netAmt: totals.buyAmt - totals.sellAmt } };
    });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to load broker" }, { status: 502 });
  }
}
