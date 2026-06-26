import { db } from "@/lib/db";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string; date: string }> }) {
  const { symbol, date } = await params;
  if (!symbol || !date) {
    return Response.json({ error: "symbol and date are required" }, { status: 400 });
  }

  const sym = symbol.toUpperCase();

  // Try broker_daily_summary first, fall back to broker_daily_agg
  let rows;
  let status = "finalized";
  try {
    const r = await db.execute({
      sql: `SELECT brokerCode, buyQty, sellQty, netQty, buyAmt, sellAmt,
                   buyContracts, sellContracts, status, finalizedAt
            FROM broker_daily_summary
            WHERE tradeDate = ? AND symbol = ?
            ORDER BY ABS(netQty) DESC`,
      args: [date, sym],
    });
    rows = r.rows;
    if (rows.length > 0) {
      status = String(rows[0].status);
    }
  } catch {
    // broker_daily_summary may not exist yet
  }

  if (!rows || rows.length === 0) {
    // Fall back to broker_daily_agg
    const r = await db.execute({
      sql: `SELECT brokerId,
                   SUM(buyQty) as buyQty, SUM(sellQty) as sellQty,
                   SUM(netQty) as netQty,
                   SUM(buyAmt) as buyAmt, SUM(sellAmt) as sellAmt,
                   COUNT(CASE WHEN buyQty > 0 THEN 1 END) as buyContracts,
                   COUNT(CASE WHEN sellQty > 0 THEN 1 END) as sellContracts,
                   COALESCE(status, 'finalized') as status, MAX(finalizedAt) as finalizedAt
            FROM broker_daily_agg
            WHERE tradeDate = ? AND stockSymbol = ?
            GROUP BY brokerId
            ORDER BY ABS(SUM(netQty)) DESC`,
      args: [date, sym],
    });
    rows = r.rows;
    if (rows.length > 0) {
      status = String(rows[0].status ?? "finalized");
    }
  }

  if (!rows || rows.length === 0) {
    // Fallback: MeroLagani overall broker activity (per-broker totals, not per-stock)
    const mero = await fetchMeroLaganiSummary();
    if (mero?.broker?.detail?.length) {
      const brokers = mero.broker.detail.map((b) => ({
        brokerCode: b.b,
        buyQty: 0,
        sellQty: 0,
        netQty: 0,
        buyAmt: Number(b.p) || 0,
        sellAmt: Number(b.s) || 0,
        buyContracts: 0,
        sellContracts: 0,
      }));
      const totals = {
        buyQty: 0, sellQty: 0, netQty: 0,
        buyAmt: brokers.reduce((a: number, b: any) => a + b.buyAmt, 0),
        sellAmt: brokers.reduce((a: number, b: any) => a + b.sellAmt, 0),
      };
      return Response.json({
        symbol: sym,
        date,
        source: "merolagani",
        status: "live",
        finalizedAt: null,
        accurate: false,
        brokers,
        totals,
        note: "MeroLagani only provides aggregate broker activity (all stocks combined), not per-stock breakdown",
      });
    }
    return Response.json({
      symbol: sym,
      date,
      status: "empty",
      brokers: [],
      totals: { buyQty: 0, sellQty: 0, netQty: 0, buyAmt: 0, sellAmt: 0 },
    });
  }

  const brokers = rows.map((r) => ({
    brokerCode: String(r.brokerCode ?? r.brokerId),
    buyQty: Number(r.buyQty),
    sellQty: Number(r.sellQty),
    netQty: Number(r.netQty),
    buyAmt: Number(r.buyAmt),
    sellAmt: Number(r.sellAmt),
    buyContracts: Number(r.buyContracts ?? 0),
    sellContracts: Number(r.sellContracts ?? 0),
  }));

  const totals = {
    buyQty: brokers.reduce((s, b) => s + b.buyQty, 0),
    sellQty: brokers.reduce((s, b) => s + b.sellQty, 0),
    netQty: brokers.reduce((s, b) => s + b.netQty, 0),
    buyAmt: brokers.reduce((s, b) => s + b.buyAmt, 0),
    sellAmt: brokers.reduce((s, b) => s + b.sellAmt, 0),
    buyContracts: brokers.reduce((s, b) => s + b.buyContracts, 0),
    sellContracts: brokers.reduce((s, b) => s + b.sellContracts, 0),
  };

  // Accuracy check: buyQty should equal sellQty at the per-date level
  const accurate = Math.abs(totals.buyQty - totals.sellQty) <= 1;

  return Response.json({
    symbol: sym,
    date,
    status: rows.length > 0 ? status : "empty",
    finalizedAt: rows.length > 0 && rows[0].finalizedAt ? Number(rows[0].finalizedAt) : null,
    accurate,
    brokers,
    totals,
  });
}
