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
