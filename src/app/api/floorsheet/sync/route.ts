import { getNepse, cached } from "@/lib/nepse";
import { saveFloorsheetTrades, saveBrokerDailyAgg, saveDailyOhlcv, getFloorsheetCount, getAvailableDates } from "@/lib/db";
import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 30;

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

async function fetchAllTrades(): Promise<FloorSheetItem[]> {
  const nepse = getNepse();
  const first = await nepse.getFloorSheet({ page: 0, size: PAGE_SIZE }) as FloorSheet;
  const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
  const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    const res = await Promise.all(
      batch.map((p) =>
        nepse.getFloorSheet({ page: p, size: PAGE_SIZE })
          .then((r) => (r as FloorSheet).floorsheets?.content ?? [])
          .catch(() => []),
      ),
    );
    res.forEach((r) => items.push(...r));
  }
  return items;
}

// Compute broker_daily_agg from raw trades
function computeBrokerAgg(date: string, items: FloorSheetItem[]) {
  const map = new Map<string, { buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>();
  const key = (stock: string, broker: string) => `${stock}::${broker}`;

  for (const t of items) {
    const sym = t.stockSymbol;
    const qty = t.contractQuantity;
    const amt = t.contractAmount;
    const buyer = String(t.buyerMemberId);
    const seller = String(t.sellerMemberId);

    const bk = key(sym, buyer);
    const b = map.get(bk) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
    b.buyQty += qty; b.buyAmt += amt;
    map.set(bk, b);

    const sk = key(sym, seller);
    const s = map.get(sk) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
    s.sellQty += qty; s.sellAmt += amt;
    map.set(sk, s);
  }

  return [...map.entries()].map(([k, v]) => {
    const [stockSymbol, brokerId] = k.split("::");
    return {
      tradeDate: date,
      stockSymbol,
      brokerId,
      buyQty: v.buyQty,
      buyAmt: v.buyAmt,
      sellQty: v.sellQty,
      sellAmt: v.sellAmt,
      netQty: v.buyQty - v.sellQty,
      netAmt: v.buyAmt - v.sellAmt,
    };
  });
}

export async function GET() {
  try {
    const date = todayStr();

    const result = await cached(`fs-sync:${date}`, 3_000, async () => {
      const existingCount = await getFloorsheetCount(date);
      const items = await fetchAllTrades();

      if (items.length !== existingCount || existingCount === 0) {
        // Save raw trades with trade_order for tick-rule
        const trades = items.map((t, i) => ({
          tradeDate: date,
          stockSymbol: t.stockSymbol,
          securityName: t.securityName,
          buyerMemberId: String(t.buyerMemberId),
          sellerMemberId: String(t.sellerMemberId),
          contractQuantity: t.contractQuantity,
          contractAmount: t.contractAmount,
          tradeOrder: i,
        }));
        await saveFloorsheetTrades(date, trades);

        // Compute and save broker_daily_agg
        const aggs = computeBrokerAgg(date, items);
        await saveBrokerDailyAgg(date, aggs);

        // Fetch OHLCV from MeroLagani and save
        try {
          const mero = await fetchMeroLaganiSummary();
          if (mero?.turnover?.detail?.length) {
            const ohlcv = mero.turnover.detail.map((s) => ({
              symbol: s.s,
              open: s.op ?? 0,
              high: s.h ?? 0,
              low: s.l ?? 0,
              close: s.lp ?? 0,
              volume: s.q ?? 0,
              value: s.t ?? 0,
            }));
            await saveDailyOhlcv(date, ohlcv);
          }
        } catch { /* OHLCV optional */ }
      }

      const dates = await getAvailableDates();
      return { date, tradeCount: items.length, syncedAt: Date.now(), dates };
    });

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Sync failed" }, { status: 502 });
  }
}
