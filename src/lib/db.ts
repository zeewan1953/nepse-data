import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

type OhlcRow = {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  averageTradedPrice: number;
};

type LiveEntry = {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  averageTradedPrice: number;
};

/**
 * Save live market snapshot to Supabase `nepse` table.
 * Uses upsert on symbol (primary key).
 */
export async function saveLiveSnapshot(live: Array<LiveEntry>): Promise<void> {
  if (!live.length) return;

  const rows = live.map((row) => ({
    symbol: row.symbol,
    open_price: row.openPrice,
    high_price: row.highPrice,
    low_price: row.lowPrice,
    average_traded_price: row.averageTradedPrice,
    updated_at: new Date().toISOString(),
  }));

  // Supabase upsert in batches of 500 to avoid payload size limits
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from("nepse").upsert(batch, { onConflict: "symbol" });
    if (error) {
      console.error("saveLiveSnapshot batch error:", error.message);
    }
  }
}

/**
 * Get OHLC data map from Supabase `nepse` table.
 */
export async function getOhlcMap(): Promise<Map<string, OhlcRow>> {
  const { data, error } = await supabaseAdmin
    .from("nepse")
    .select("symbol, open_price, high_price, low_price, average_traded_price");

  if (error) {
    console.error("getOhlcMap error:", error.message);
    return new Map();
  }

  const map = new Map<string, OhlcRow>();
  for (const row of data || []) {
    map.set(String(row.symbol), {
      symbol: String(row.symbol),
      openPrice: Number(row.open_price ?? 0),
      highPrice: Number(row.high_price ?? 0),
      lowPrice: Number(row.low_price ?? 0),
      averageTradedPrice: Number(row.average_traded_price ?? 0),
    });
  }
  return map;
}
