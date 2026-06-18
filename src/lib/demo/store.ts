// Demo (Paper Trading) Account — types and localStorage persistence
// All data is fake. No real money, no real brokerage connection.

export const STARTING_BALANCE = 500_000;

export type DemoAccount = {
  userId: string;
  balance: number;
  createdAt: number;
  resetAt?: number;
};

export type DemoPosition = {
  symbol: string;
  qty: number;
  avgCost: number;
  openedAt: number;
};

export type DemoOrder = {
  id: string;
  ts: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fees: number;
  total: number;
  balanceAfter: number;
  signalSnapshot?: {
    recommendation: string;
    confidence: number;
    trend: string | null;
  } | null;
};

export type DemoState = {
  account: DemoAccount;
  positions: DemoPosition[];
  orders: DemoOrder[];
};

const KEY_PREFIX = "demo:state:";

export function loadState(userId: string): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as DemoState;
  } catch {
    return null;
  }
}

export function saveState(userId: string, state: DemoState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function initAccount(userId: string): DemoState {
  const now = Date.now();
  return {
    account: { userId, balance: STARTING_BALANCE, createdAt: now },
    positions: [],
    orders: [],
  };
}

export function resetAccount(userId: string): DemoState {
  const now = Date.now();
  const state: DemoState = {
    account: { userId, balance: STARTING_BALANCE, createdAt: now, resetAt: now },
    positions: [],
    orders: [],
  };
  saveState(userId, state);
  return state;
}

export function clearState(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${KEY_PREFIX}${userId}`);
}

// Generate a unique order ID
export function orderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
