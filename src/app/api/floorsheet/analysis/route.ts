import { getNepse, cached } from "@/lib/nepse";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

type BrokerAgg = { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number };
type StockAgg = { symbol: string; name: string; qty: number; amount: number; trades: number };

async function fetchPage(page: number): Promise<FloorSheetItem[] | null> {
  try {
    const r = (await getNepse().getFloorSheet({ page, size: PAGE_SIZE })) as FloorSheet;
    const c = r.floorsheets?.content;
    if (c && c.length) return c;
  } catch { /* skip */ }
  return null;
}

async function fetchTrades(): Promise<{ items: FloorSheetItem[]; total: number; truncated: boolean }> {
  const first = (await fetchPage(0)) ?? [];
  let totalElements = first.length;
  let totalPages = 1;
  try {
    const meta = (await getNepse().getFloorSheet({ page: 0, size: PAGE_SIZE })) as FloorSheet;
    totalElements = meta.floorsheets?.totalElements ?? meta.totalTrades ?? first.length;
    totalPages = meta.floorsheets?.totalPages ?? 1;
  } catch { /* ok */ }

  const pages = Math.min(totalPages, MAX_PAGES);
  const items: FloorSheetItem[] = [...first];
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  const BATCH = 6;
  for (let i = 0; i < rest.length; i += BATCH) {
    const batch = rest.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((p) => fetchPage(p)));
    results.forEach((r) => { if (r) items.push(...r); });
  }
  return { items, total: totalElements, truncated: totalPages > MAX_PAGES };
}

export async function GET() {
  try {
    const data = await cached("fs-analysis", 300_000, async () => {
      const { items, total, truncated } = await fetchTrades();
      const brokers = new Map<string, BrokerAgg>();
      const stocks = new Map<string, StockAgg>();
      let totalQty = 0;
      let totalAmount = 0;
      const getB = (id: string) => brokers.get(id) ?? { id, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };

      for (const t of items) {
        totalQty += t.contractQuantity;
        totalAmount += t.contractAmount;
        const b = getB(t.buyerMemberId);
        b.buyQty += t.contractQuantity; b.buyAmt += t.contractAmount;
        brokers.set(t.buyerMemberId, b);
        const s = getB(t.sellerMemberId);
        s.sellQty += t.contractQuantity; s.sellAmt += t.contractAmount;
        brokers.set(t.sellerMemberId, s);
        const st = stocks.get(t.stockSymbol) ?? { symbol: t.stockSymbol, name: t.securityName, qty: 0, amount: 0, trades: 0 };
        st.qty += t.contractQuantity; st.amount += t.contractAmount; st.trades += 1;
        stocks.set(t.stockSymbol, st);
      }

      const brokerList = [...brokers.values()].map((b) => ({ ...b, netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt }));
      return {
        totals: { trades: total, sampled: items.length, qty: totalQty, amount: totalAmount, brokers: brokers.size, stocks: stocks.size, truncated },
        netFlow: [...brokerList].sort((a, b) => b.netAmt - a.netAmt),
        topBuyers: [...brokerList].sort((a, b) => b.buyAmt - a.buyAmt).slice(0, 10),
        topSellers: [...brokerList].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, 10),
        stocks: [...stocks.values()].sort((a, b) => b.amount - a.amount),
      };
    });
    return Response.json({ ...data, generatedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to analyse floorsheet" }, { status: 502 });
  }
}
