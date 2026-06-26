import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.execute({
      sql: "SELECT * FROM trade_decision_log ORDER BY id DESC LIMIT 200",
    });
    const logs = result.rows.map((r) => ({
      id: Number(r.id),
      timestamp: String(r.timestamp),
      stockSymbol: String(r.stock_symbol),
      cmf: r.cmf != null ? Number(r.cmf) : null,
      mfi: r.mfi != null ? Number(r.mfi) : null,
      volZscore: r.vol_zscore != null ? Number(r.vol_zscore) : null,
      smartMoneyScore: r.smart_money_score != null ? Number(r.smart_money_score) : null,
      signal: String(r.signal),
      confidence: Number(r.confidence),
      dataSource: String(r.data_source),
    }));
    return Response.json({ count: logs.length, logs });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Query failed" }, { status: 500 });
  }
}
