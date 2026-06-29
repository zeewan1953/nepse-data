import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

/** If any single sector exceeds this % of portfolio, flag a concentration warning */
const CONCENTRATION_THRESHOLD_PCT = 40;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const holdingsParam = searchParams.get("holdings") || "";

    if (!holdingsParam) {
      return NextResponse.json({
        sectors: [],
        totalValue: 0,
        concentrationWarnings: [],
      });
    }

    // holdings format: SYM1:VALUE1,SYM2:VALUE2 (value = marketValue of holding)
    const pairs = holdingsParam.split(",").map(p => p.trim()).filter(Boolean);
    const symbols: string[] = [];
    const values: number[] = [];
    for (const pair of pairs) {
      const [sym, val] = pair.split(":");
      if (sym && val) {
        symbols.push(sym.toUpperCase());
        values.push(parseFloat(val) || 0);
      }
    }

    if (symbols.length === 0) {
      return NextResponse.json({ sectors: [], totalValue: 0, concentrationWarnings: [] });
    }

    // Fetch sector mappings for all symbols
    const placeholders = symbols.map(() => "?").join(",");
    const mappings = await execute(
      `SELECT symbol, COALESCE(sector, 'Uncategorized') AS sector
       FROM stock_sector_mapping
       WHERE symbol IN (${placeholders})`,
      symbols
    );
    const sectorMap = new Map<string, string>();
    for (const r of mappings.rows as any[]) {
      sectorMap.set(r.symbol, r.sector);
    }

    // Compute exposure
    const sectorValues = new Map<string, number>();
    let totalValue = 0;
    for (let i = 0; i < symbols.length; i++) {
      const sector = sectorMap.get(symbols[i]) || "Uncategorized";
      const v = values[i];
      sectorValues.set(sector, (sectorValues.get(sector) || 0) + v);
      totalValue += v;
    }

    const sectors = Array.from(sectorValues.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        pctOfPortfolio: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.pctOfPortfolio - a.pctOfPortfolio);

    const concentrationWarnings = sectors
      .filter(s => s.pctOfPortfolio > CONCENTRATION_THRESHOLD_PCT)
      .map(s => ({
        sector: s.sector,
        pctOfPortfolio: s.pctOfPortfolio,
      }));

    return NextResponse.json({
      sectors,
      totalValue,
      concentrationWarnings,
      thresholdPct: CONCENTRATION_THRESHOLD_PCT,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
