import "server-only";
import { Nepse } from "@rumess/nepse-api";
import type { SecurityPriceVolumeHistory } from "@rumess/nepse-api";

// Single long-lived client so the auth token / dummy-id state is reused across
// requests instead of re-negotiating on every API call.
declare global {
  // eslint-disable-next-line no-var
  var __nepseClient: Nepse | undefined;
}

export function getNepse(): Nepse {
  if (!globalThis.__nepseClient) {
    globalThis.__nepseClient = new Nepse();
  }
  return globalThis.__nepseClient;
}

export type DailyTradeStat = {
  securityId: string | number;
  securityName: string;
  symbol: string;
  indexId: number;
  totalTradeQuantity: number;
  lastTradedPrice: number;
  percentageChange: number;
  previousClose: number;
  closePrice: number;
};

// Last session's daily trade stats for every traded security. This GET endpoint
// keeps working after the market closes (unlike the live feed), so it provides
// the "last traded" values when the market is shut.
export async function getDailyTradeStats(): Promise<DailyTradeStat[]> {
  return getNepse().requestGETAPI<DailyTradeStat[]>(
    "/api/nots/securityDailyTradeStat/58",
  );
}

// Resolve a symbol to its NEPSE security id, trying the keymap first and then
// the live/daily-stats feeds (some traded symbols are missing from the
// "nonDelisted" security list the keymap is built from).
export async function resolveSecurityId(symbol: string): Promise<number | null> {
  const nepse = getNepse();
  const km = await nepse.getSecuritySymbolIdKeymap().catch(() => null);
  const fromKm = km?.get(symbol);
  if (fromKm) return Number(fromKm);

  const stats = await getDailyTradeStats().catch(() => []);
  const st = stats.find((s) => s.symbol === symbol);
  if (st?.securityId) return Number(st.securityId);

  const live = await nepse.getLiveMarket().catch(() => []);
  const lv = live.find((s) => s.symbol === symbol);
  if (lv?.securityId) return Number(lv.securityId);

  return null;
}

// Long daily history by security id (the wrapper only returns the first 10-row
// page, and only resolves symbols present in the keymap).
export async function getPriceHistoryById(
  id: number,
  size = 300,
): Promise<SecurityPriceVolumeHistory> {
  return getNepse().requestGETAPI<SecurityPriceVolumeHistory>(
    `/api/nots/market/security/price/${id}?size=${size}&page=0`,
  );
}

// Security details (profile + day stats) by security id.
export async function getSecurityDetailsById(id: number): Promise<unknown> {
  const nepse = getNepse();
  const payloadId = await nepse.getPOSTPayloadIDForScrips();
  return nepse.requestPOSTAPI(`/api/nots/security/${id}`, { id: payloadId });
}

export async function getPriceHistory(
  symbol: string,
  size = 300,
): Promise<SecurityPriceVolumeHistory> {
  const id = await resolveSecurityId(symbol);
  if (!id) throw new Error(`Security ${symbol} not found`);
  return getPriceHistoryById(id, size);
}

// Tiny in-memory cache to avoid hammering the upstream NEPSE site. Live data is
// cached briefly; reference data (company list) for longer.
type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, expires: now + ttlMs });
  return value;
}
