import "server-only";
import { getLastNTradingDays } from "./date-utils";

export const TRADING_DAYS: Record<string, number> = {
  "1D": 1,
  "3D": 3,
  "1W": 5,
  "1M": 22,
  "3M": 66,
};

export const EXPECTED_TRADING_DAYS_PER_YEAR = 240;

export function getTradingDaysForRange(range: string, endDate?: string): string[] {
  const n = TRADING_DAYS[range];
  if (!n) return [];
  return getLastNTradingDays(n, endDate);
}
