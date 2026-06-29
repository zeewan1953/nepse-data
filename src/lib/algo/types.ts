import type { ConditionNode } from "./rule-engine";

export type UniverseType = "all_listed" | "watchlist" | "custom_list";

export interface AlgoStrategy {
  id: number;
  user_id: string;
  name: string;
  universe: UniverseType;
  custom_symbol_list: string[] | null;
  entry_rule: ConditionNode;
  exit_rule: ConditionNode;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  max_hold_days: number | null;
  position_size_pct: number;
  max_concurrent_positions: number;
  is_active: boolean;
  last_backtested_at: number | null;
  updated_at: number;
  created_at: number;
}

export interface AlgoStrategyPosition {
  id: number;
  strategy_id: number;
  symbol: string;
  entry_trade_id: number | null;
  exit_trade_id: number | null;
  entry_date: string;
  exit_date: string | null;
  entry_price: number;
  exit_price: number | null;
  status: "open" | "closed";
  exit_reason: string | null;
}

export interface AlgoPendingOrder {
  id: number;
  strategy_id: number;
  symbol: string;
  action: "ENTER" | "EXIT";
  flagged_date: string;
  exit_reason: string | null;
  status: "pending" | "filled" | "cancelled";
  filled_date: string | null;
  filled_price: number | null;
}

export interface AlgoRunLog {
  id: number;
  strategy_id: number | null;
  run_date: string;
  symbols_evaluated: number;
  entries_flagged: number;
  exits_flagged: number;
  skipped_capacity: number;
  errors: string | null;
  run_at: number;
}

export interface BacktestResult {
  totalReturnPct: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  avgHoldingPeriod: number;
  equityCurve: { date: string; equity: number }[];
  trades: {
    entryDate: string;
    exitDate: string | null;
    symbol: string;
    entryPrice: number;
    exitPrice: number | null;
    pnlPct: number;
    exitReason: string | null;
  }[];
  disclaimer: string;
}
