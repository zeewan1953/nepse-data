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
  // NEPSE debentures use many suffix patterns:
  //   Full year:    NABIL2085, NICA2086
  //   Short year:   PBD88, NCCD86, SBLD84, KBLD89
  //   Slash range:  NICAD85/86, NIMBD84/85
  //   3-digit:      NABIL990, KBL990
  //   90-99 range:  NABIL95, NICA96
  //   Letter+D+num: any symbol with D followed by 2-4 digits at end
  if (
    /[A-Z](?:20[89][0-9])$/.test(sym) ||        // full year 2085-2089
    /[A-Z]990$/.test(sym) ||                     // 990 suffix
    /[A-Z]9[0-9]$/.test(sym) ||                  // 90-99 suffix
    /[A-Z][0-9]{2}\/[0-9]{2}$/.test(sym) ||      // slash range 85/86, 84/85
    /[A-Z]D[0-9]{2,4}(?:\/[0-9]{2})?$/.test(sym) || // D+digits: NCCD86, NIMBD84/85
    /[A-Z][0-9]{2}$/.test(sym)                    // any 2-digit suffix: PBD88, SBLD84
  ) {
    return "DB";
  }

  // --- Mutual Fund detection ------------------------------------------------
  // NEPSE mutual fund symbols: LVF2, NBF2, GIBF1, NMBSF, NMBHF, NMBGF, STF,
  // or contain FUND, SCHEME, MF, SIGS in symbol or name.
  const mfSymbolKeywords = ["STF", "FUND", "SCHEME", "SIGS", "NMBSF", "NMBHF", "NMBGF"];
  const mfNameKeywords = ["mutual fund", "fund", "scheme", "growth fund", "balanced fund", "income fund", "value fund"];
  if (
    mfSymbolKeywords.some((k) => sym.includes(k)) ||
    mfNameKeywords.some((k) => name.includes(k)) ||
    /[A-Z]F[0-9]$/.test(sym) ||                  // F+digit: LVF2, NBF2, GIBF1, KBF3
    /MF$/.test(sym)                                // ends with MF: NMF, SANVI MF
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
