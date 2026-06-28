import "server-only";
import { getLastNTradingDays } from "./date-utils";
import { TRADING_DAYS, TRADING_DAYS_PER_YEAR } from "./trading-constants";

export { TRADING_DAYS, RANGE_LABELS, TRADING_DAYS_PER_YEAR } from "./trading-constants";

export function getTradingDaysForRange(range: string, endDate?: string): string[] {
  const n = TRADING_DAYS[range];
  if (!n) return [];
  return getLastNTradingDays(n, endDate);
}
