// Re-export upstream NEPSE API types so the client can import from one place.
export type {
  MarketStatus,
  LiveMarketData,
  NepseIndex,
  NepseSubIndex,
  TopTenItem,
  TopTenTradeScripItem,
  TopTenTurnoverScripItem,
  TopTenTransactionScripItem,
  FloorSheet,
  FloorSheetItem,
  MarketDepth,
  SecurityDetails,
  SecurityPriceVolumeHistory,
  SecurityPriceVolumeHistoryItem,
} from "@rumess/nepse-api";

import type {
  SecurityDetails,
  SecurityPriceVolumeHistory,
  MarketDepth,
} from "@rumess/nepse-api";

export type SecurityResponse = {
  symbol: string;
  details: SecurityDetails | null;
  history: SecurityPriceVolumeHistory | null;
  depth: MarketDepth | null;
};

// ---------------------------------------------------------------------------
// Symbol type classification
// ---------------------------------------------------------------------------

/** Security type codes used across the whole app. */
export type SymbolType = "EQ" | "DB" | "MF" | "PS";

/**
 * Classify a NEPSE symbol (and optionally its security name) into one of:
 *  EQ – Equity Share
 *  DB – Debenture / Bond
 *  MF – Mutual Fund
 *  PS – Preferred Share
 *
 * Rules (evaluated in priority order):
 *  1. Debenture/Bond  → symbol ends with a year suffix (2085-2089) or
 *     a short numeric suffix (90-99, 990)
 *  2. Mutual Fund     → symbol or name contains MF keywords
 *  3. Preferred Share → name contains "Preference Share" / "Preferred Share"
 *  4. Everything else → EQ (equity)
 */
export function classifySymbol(symbol: string, securityName?: string): SymbolType {
  const sym = symbol.toUpperCase();
  const name = (securityName ?? "").toLowerCase();

  // --- Debenture / Bond detection -------------------------------------------
  // Suffix patterns: 2085, 2086, 2087, 2088, 2089 (full Nepali year)
  // OR short suffix: 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 990
  // We match these at the END of the symbol, preceded by at least one letter.
  if (
    /[A-Z](?:20[89][0-9])$/.test(sym) ||
    /[A-Z]990$/.test(sym) ||
    /[A-Z]9[0-9]$/.test(sym)
  ) {
    return "DB";
  }

  // --- Mutual Fund detection ------------------------------------------------
  const mfSymbolKeywords = ["STF", "MF", "FUND", "SCHEME", "SIGS", "NMBSF", "NMBHF", "NMBGF"];
  const mfNameKeywords = ["mutual fund", "fund", "scheme", "growth fund", "balanced fund", "income fund"];
  if (
    mfSymbolKeywords.some((k) => sym.includes(k)) ||
    mfNameKeywords.some((k) => name.includes(k))
  ) {
    return "MF";
  }

  // --- Preferred Share detection --------------------------------------------
  if (name.includes("preference share") || name.includes("preferred share")) {
    return "PS";
  }

  // Default: Equity
  return "EQ";
}

/** Badge colour classes for each type, safe for Tailwind purge. */
export const TYPE_BADGE: Record<SymbolType, string> = {
  EQ: "bg-primary/10 text-primary",
  DB: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  MF: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  PS: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
};
