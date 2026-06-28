import { execute } from "@/lib/db";
import { getNepse } from "@/lib/nepse";
import { getTargetDateWithFallback } from "@/lib/date-utils";
import type { NextRequest } from "next/server";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const CACHE_TTL = 60_000;

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

let liveCache: { data: FloorSheetItem[]; ts: number } | null = null;

async function fetchLiveTrades(): Promise<FloorSheetItem[] | null> {
  if (liveCache && Date.now() - liveCache.ts < CACHE_TTL) return liveCache.data;

  try {
    const first = await getNepse().getFloorSheet({ page: 0, size: PAGE_SIZE }) as FloorSheet;
    const items: FloorSheetItem[] = [...(first.floorsheets?.content ?? [])];
    const pages = Math.min(first.floorsheets?.totalPages ?? 1, MAX_PAGES);
    const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
    for (let i = 0; i < rest.length; i += 6) {
      const batch = rest.slice(i, i + 6);
      const res = await Promise.all(
        batch.map((p) =>
          getNepse().getFloorSheet({ page: p, size: PAGE_SIZE })
            .then((r) => (r as FloorSheet).floorsheets?.content ?? [])
            .catch(() => []),
        ),
      );
      res.forEach((r) => items.push(...r));
    }
    const result = items.length > 0 ? items : null;
    liveCache = result ? { data: result, ts: Date.now() } : liveCache;
    return result;
  } catch {
    return liveCache?.data ?? null;
  }
}

function buildStockBrokers(items: FloorSheetItem[], sourceDate: string) {
  const stockMap = new Map<string, { symbol: string; name: string; qty: number; amount: number; trades: number }>();
  const brokerBreakdown = new Map<string, Map<string, { buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>>();

  for (const t of items) {
    const sym = t.stockSymbol;
    const name = t.securityName;
    const qty = t.contractQuantity;
    const amt = t.contractAmount;
    const buyer = String(t.buyerMemberId);
    const seller = String(t.sellerMemberId);

    const st = stockMap.get(sym) ?? { symbol: sym, name, qty: 0, amount: 0, trades: 0 };
    st.qty += qty; st.amount += amt; st.trades += 1;
    stockMap.set(sym, st);

    if (!brokerBreakdown.has(sym)) brokerBreakdown.set(sym, new Map());
    const bm = brokerBreakdown.get(sym)!;
    const bEntry = bm.get(buyer) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
    bEntry.buyQty += qty; bEntry.buyAmt += amt;
    bm.set(buyer, bEntry);
    const sEntry = bm.get(seller) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
    sEntry.sellQty += qty; sEntry.sellAmt += amt;
    bm.set(seller, sEntry);
  }

  const stocks = [...stockMap.values()]
    .map((s) => ({ ...s, avgPrice: s.qty > 0 ? s.amount / s.qty : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const stockBrokers: Record<string, Array<any>> = {};
  for (const [sym, bm] of brokerBreakdown) {
    stockBrokers[sym] = [...bm.entries()].map(([id, b]) => ({
      id, buyQty: b.buyQty, buyAmt: b.buyAmt, sellQty: b.sellQty, sellAmt: b.sellAmt,
      netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt,
      avgBuyPrice: b.buyQty > 0 ? b.buyAmt / b.buyQty : 0,
      avgSellPrice: b.sellQty > 0 ? b.sellAmt / b.sellQty : 0,
      action: b.buyAmt > 0 && b.sellAmt === 0 ? "aggressive-buy"
        : b.sellAmt > 0 && b.buyAmt === 0 ? "aggressive-sell"
        : b.buyAmt > 0 && b.sellAmt > 0 ? "hold" : "none",
    })).sort((a, b) => b.netAmt - a.netAmt);
  }

  return { date: sourceDate, stocks, stockBrokers };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const live = sp.get("live") === "true";

    // Live mode: fetch from NEPSE directly
    if (live) {
      const items = await fetchLiveTrades();
      if (items && items.length > 0) {
        const result = buildStockBrokers(items, todayStr());
        return Response.json({ ...result, source: "live" });
      }
    }

    // DB mode
    const { date } = await getTargetDateWithFallback(dateParam || undefined);
    const symbol = sp.get("symbol") || undefined;

    let trades;
    if (symbol) {
      trades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ? AND stockSymbol = ?",
        [date, symbol],
      );
    } else {
      trades = await execute(
        "SELECT stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount FROM floorsheet_trades WHERE tradeDate = ?",
        [date],
      );
    }

    const stockMap = new Map<string, { symbol: string; name: string; qty: number; amount: number; trades: number }>();
    const brokerBreakdown = new Map<string, Map<string, { buyQty: number; buyAmt: number; sellQty: number; sellAmt: number }>>();

    for (const r of trades.rows) {
      const sym = String(r.stockSymbol);
      const name = String(r.securityName);
      const qty = Number(r.contractQuantity);
      const amt = Number(r.contractAmount);
      const buyer = String(r.buyerMemberId);
      const seller = String(r.sellerMemberId);

      const st = stockMap.get(sym) ?? { symbol: sym, name, qty: 0, amount: 0, trades: 0 };
      st.qty += qty; st.amount += amt; st.trades += 1;
      stockMap.set(sym, st);

      if (!brokerBreakdown.has(sym)) brokerBreakdown.set(sym, new Map());
      const bm = brokerBreakdown.get(sym)!;
      const bEntry = bm.get(buyer) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      bEntry.buyQty += qty; bEntry.buyAmt += amt;
      bm.set(buyer, bEntry);
      const sEntry = bm.get(seller) ?? { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 };
      sEntry.sellQty += qty; sEntry.sellAmt += amt;
      bm.set(seller, sEntry);
    }

    const stocks = [...stockMap.values()]
      .map((s) => ({ ...s, avgPrice: s.qty > 0 ? s.amount / s.qty : 0 }))
      .sort((a, b) => b.amount - a.amount);

    const stockBrokers: Record<string, Array<any>> = {};
    for (const [sym, bm] of brokerBreakdown) {
      stockBrokers[sym] = [...bm.entries()].map(([id, b]) => ({
        id, buyQty: b.buyQty, buyAmt: b.buyAmt, sellQty: b.sellQty, sellAmt: b.sellAmt,
        netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt,
        avgBuyPrice: b.buyQty > 0 ? b.buyAmt / b.buyQty : 0,
        avgSellPrice: b.sellQty > 0 ? b.sellAmt / b.sellQty : 0,
        action: b.buyAmt > 0 && b.sellAmt === 0 ? "aggressive-buy"
          : b.sellAmt > 0 && b.buyAmt === 0 ? "aggressive-sell"
          : b.buyAmt > 0 && b.sellAmt > 0 ? "hold" : "none",
      })).sort((a, b) => b.netAmt - a.netAmt);
    }

    return Response.json({ date, stocks, stockBrokers });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 502 });
  }
}
