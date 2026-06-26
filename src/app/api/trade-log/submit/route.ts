import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stockSymbol, cmf, mfi, volZscore, smartMoneyScore, signal, confidence, dataSource } = body;

    if (!stockSymbol || !signal || confidence == null || !dataSource) {
      return Response.json({ error: "Missing required fields: stockSymbol, signal, confidence, dataSource" }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT INTO trade_decision_log (timestamp, stock_symbol, cmf, mfi, vol_zscore, smart_money_score, signal, confidence, data_source)
            VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        stockSymbol,
        cmf != null ? Number(cmf) : null,
        mfi != null ? Number(mfi) : null,
        volZscore != null ? Number(volZscore) : null,
        smartMoneyScore != null ? Number(smartMoneyScore) : null,
        signal,
        Number(confidence),
        dataSource,
      ],
    });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Failed to log trade decision" }, { status: 500 });
  }
}
