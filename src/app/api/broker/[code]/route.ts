import { getNepse, cached, safeNepseCall } from "@/lib/nepse";
import { db } from "@/lib/db";
import type { FloorSheet, FloorSheetItem } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 500;
const MAX_PAGES = 50;

type Row = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number };

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

function normalizeDbRow(row: any): Row {
  return {
    symbol: String(row.stockSymbol || row.s || ""),
    name: String(row.securityName || row.name || row.symbol || ""),
    buyQty: Number(row.buyQty || 0),
    buyAmt: Number(row.buyAmt || 0),
    sellQty: Number(row.sellQty || 0),
    sellAmt: Number(row.sellAmt || 0),
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const broker = Number(code);
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "TODAY";
  if (!broker) return Response.json({ error: "Invalid broker number" }, { status: 400 });

  try {
    // DB-first: try local floorsheet + broker_daily_agg
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    const lookback: Record<string, number> = { "TODAY": 0, "1D": 0, "3D": 2, "1W": 6, "1M": 21, "3M": 63 };
    const days = lookback[range] ?? 0;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    const toStr = todayStr;

    const dbRows = await db.execute({
      sql: `SELECT stockSymbol, securityName, SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt, SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt FROM broker_daily_agg WHERE brokerId = ? AND tradeDate >= ? AND tradeDate <= ? GROUP BY stockSymbol ORDER BY ABS(SUM(buyAmt) - SUM(sellAmt)) DESC`,
      args: [String(broker), fromStr, toStr],
    });

    if (dbRows.rows.length > 0) {
      const stocks = dbRows.rows.map(normalizeDbRow).map((r) => ({
        ...r,
        netQty: r.buyQty - r.sellQty,
        netAmt: r.buyAmt - r.sellAmt,
      }));
      const totals = stocks.reduce(
        (a, s) => ({ buyAmt: a.buyAmt + s.buyAmt, sellAmt: a.sellAmt + s.sellAmt }),
        { buyAmt: 0, sellAmt: 0 },
      );
      return Response.json({
        broker,
        stocks,
        totals: { ...totals, netAmt: totals.buyAmt - totals.sellAmt },
        source: "database",
      });
    }
  } catch (dbErr) {
    console.error("[broker] DB-first read failed, falling back to NEPSE live:", dbErr);
  }

  // Fallback: live NEPSE
  try {
    const data = await cached(`broker:${broker}:${range}`, 30_000, async () => {
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
    return Response.json({ ...data, source: "nepse_live" });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to load broker" }, { status: 502 });
  }
}

