import { db, execute, one } from "@/lib/db";

const STARTING_BALANCE = 1_000_000;

export type Account = {
  id: number;
  user_id: string;
  cash_balance: number;
  starting_balance: number;
  created_at: number;
  reset_count: number;
  last_reset_at: number | null;
};

export type Order = {
  id: number;
  account_id: number;
  symbol: string;
  side: "BUY" | "SELL";
  limit_price: number;
  quantity: number;
  status: "PENDING" | "FILLED" | "EXPIRED" | "CANCELLED";
  placed_at: number;
  expires_at: number;
  filled_at: number | null;
  filled_price: number | null;
};

export type Holding = {
  id: number;
  account_id: number;
  symbol: string;
  quantity: number;
  avg_buy_price: number;
};

export type Trade = {
  id: number;
  account_id: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  realized_pnl: number | null;
  fees: number;
  executed_at: number;
};

export type FeeBreakdown = {
  sebon: number;
  brokerage: number;
  dp: number;
  total: number;
};

export function calcFees(side: "BUY" | "SELL", tradeValue: number): FeeBreakdown {
  const sebon = tradeValue * 0.00015;
  const brokerageRate = tradeValue >= 500_000 ? 0.0015 : 0.003;
  const brokerage = Math.max(50, tradeValue * brokerageRate);
  const dp = side === "SELL" ? 25 : 0;
  return {
    sebon: Math.round(sebon * 100) / 100,
    brokerage: Math.round(brokerage * 100) / 100,
    dp,
    total: Math.round((sebon + brokerage + dp) * 100) / 100,
  };
}

export type EquitySnapshot = {
  date: string;
  account_id: number;
  total_equity: number;
};

export function ensureAccount(userId = "default"): Promise<Account> {
  return db.execute({
    sql: `SELECT id, user_id, cash_balance, starting_balance, created_at, reset_count, last_reset_at
          FROM paper_trading_account WHERE user_id = ? LIMIT 1`,
    args: [userId],
  }).then((r) => {
    if (r.rows.length > 0) {
      const row = r.rows[0];
      return {
        id: Number(row.id),
        user_id: String(row.user_id),
        cash_balance: Number(row.cash_balance),
        starting_balance: Number(row.starting_balance),
        created_at: Number(row.created_at),
        reset_count: Number(row.reset_count),
        last_reset_at: row.last_reset_at != null ? Number(row.last_reset_at) : null,
      };
    }
    return db.execute({
      sql: `INSERT INTO paper_trading_account (user_id, cash_balance, starting_balance, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [userId, STARTING_BALANCE, STARTING_BALANCE, Date.now()],
    }).then(() => ensureAccount(userId));
  });
}

export async function getAccount(userId = "default"): Promise<Account | null> {
  const row = await one<Account>(
    `SELECT id, user_id, cash_balance, starting_balance, created_at, reset_count, last_reset_at
     FROM paper_trading_account WHERE user_id = ?`,
    [userId],
  );
  return row ?? null;
}

export function getPendingOrders(accountId: number): Promise<Order[]> {
  return db.execute({
    sql: `SELECT id, account_id, symbol, side, limit_price, quantity, status, placed_at, expires_at, filled_at, filled_price
          FROM paper_order WHERE account_id = ? AND status = 'PENDING' ORDER BY placed_at DESC`,
    args: [accountId],
  }).then((r) => r.rows.map(mapOrder));
}

export function getOrdersByStatus(accountId: number, status: string): Promise<Order[]> {
  return db.execute({
    sql: `SELECT id, account_id, symbol, side, limit_price, quantity, status, placed_at, expires_at, filled_at, filled_price
          FROM paper_order WHERE account_id = ? AND status = ? ORDER BY placed_at DESC`,
    args: [accountId, status],
  }).then((r) => r.rows.map(mapOrder));
}

export function getHoldings(accountId: number): Promise<Holding[]> {
  return db.execute({
    sql: `SELECT id, account_id, symbol, quantity, avg_buy_price FROM paper_holding WHERE account_id = ? ORDER BY symbol`,
    args: [accountId],
  }).then((r) => r.rows.map(mapHolding));
}

export function getHolding(accountId: number, symbol: string): Promise<Holding | undefined> {
  return one<Holding>(
    `SELECT id, account_id, symbol, quantity, avg_buy_price FROM paper_holding WHERE account_id = ? AND symbol = ?`,
    [accountId, symbol],
  );
}

export function getTrades(accountId: number, limit = 100): Promise<Trade[]> {
  return db.execute({
    sql: `SELECT id, account_id, symbol, side, quantity, price, realized_pnl, fees, executed_at
          FROM paper_trade_history WHERE account_id = ? ORDER BY executed_at DESC LIMIT ?`,
    args: [accountId, limit],
  }).then((r) => r.rows.map(mapTrade));
}

export function getTradeHistory(accountId: number): Promise<Trade[]> {
  return getTrades(accountId, 500);
}

// ─── Order placement ────────────────────────────────────────────────────

export type PlaceOrderResult =
  | { ok: false; error: string }
  | { ok: true; order: Order };

export async function placeOrder(
  accountId: number,
  symbol: string,
  side: "BUY" | "SELL",
  limitPrice: number,
  quantity: number,
): Promise<PlaceOrderResult> {
  const account = await getAccountById(accountId);
  if (!account) return { ok: false, error: "Account not found" };

  if (quantity <= 0) return { ok: false, error: "Quantity must be positive" };
  if (limitPrice <= 0) return { ok: false, error: "Price must be positive" };

  if (side === "BUY") {
    const tradeValue = limitPrice * quantity;
    const fees = calcFees("BUY", tradeValue);
    const totalCost = tradeValue + fees.total;
    if (totalCost > account.cash_balance) {
      return { ok: false, error: `Insufficient cash. Need ${npr(totalCost)} (${npr(tradeValue)} + ${npr(fees.total)} fees), have ${npr(account.cash_balance)}` };
    }
  } else {
    const holding = await getHolding(accountId, symbol);
    const heldQty = holding?.quantity ?? 0;
    if (quantity > heldQty) {
      return { ok: false, error: `Insufficient shares. Have ${heldQty} ${symbol}, trying to sell ${quantity}` };
    }
  }

  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;

  const r = await db.execute({
    sql: `INSERT INTO paper_order (account_id, symbol, side, limit_price, quantity, status, placed_at, expires_at)
          VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    args: [accountId, symbol, side, limitPrice, quantity, now, expiresAt],
  });

  const order = await one<Order>(
    `SELECT id, account_id, symbol, side, limit_price, quantity, status, placed_at, expires_at, filled_at, filled_price
     FROM paper_order WHERE id = ?`,
    [Number(r.lastInsertRowid)],
  );

  return { ok: true, order: order! };
}

export async function cancelOrder(orderId: number): Promise<boolean> {
  const r = await db.execute({
    sql: `UPDATE paper_order SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'`,
    args: [orderId],
  });
  return r.rowsAffected > 0;
}

async function getAccountById(accountId: number): Promise<Account | null> {
  const row = await one<Account>(
    `SELECT id, user_id, cash_balance, starting_balance, created_at, reset_count, last_reset_at
     FROM paper_trading_account WHERE id = ?`,
    [accountId],
  );
  return row ?? null;
}

// ─── LTP Matching Engine ────────────────────────────────────────────────

export type LtpMap = Record<string, number>;

export async function matchOrders(ltpMap: LtpMap): Promise<number> {
  const pending = await db.execute({
    sql: `SELECT id, account_id, symbol, side, limit_price, quantity
          FROM paper_order WHERE status = 'PENDING'`,
  }).then((r) => r.rows.map(mapOrder));

  let filled = 0;

  for (const order of pending) {
    const ltp = ltpMap[order.symbol];
    if (ltp === undefined) continue;

    const shouldFill =
      order.side === "BUY" ? ltp <= order.limit_price : ltp >= order.limit_price;

    if (!shouldFill) continue;

    const accountId = order.account_id;

    const tradeValue = order.limit_price * order.quantity;
    const fees = calcFees(order.side, tradeValue);

    if (order.side === "BUY") {
      const totalCost = tradeValue + fees.total;
      const updated = await db.execute({
        sql: `UPDATE paper_trading_account SET cash_balance = cash_balance - ? WHERE id = ? AND cash_balance >= ?`,
        args: [totalCost, accountId, totalCost],
      });
      if (updated.rowsAffected === 0) {
        await db.execute({
          sql: `UPDATE paper_order SET status = 'EXPIRED' WHERE id = ?`,
          args: [order.id],
        });
        continue;
      }
    } else {
      const holding = await getHolding(accountId, order.symbol);
      if (!holding || holding.quantity < order.quantity) {
        await db.execute({
          sql: `UPDATE paper_order SET status = 'CANCELLED' WHERE id = ?`,
          args: [order.id],
        });
        continue;
      }
    }

    await db.execute({
      sql: `UPDATE paper_order SET status = 'FILLED', filled_at = ?, filled_price = ? WHERE id = ?`,
      args: [Date.now(), order.limit_price, order.id],
    });

    if (order.side === "BUY") {
      const existing = await getHolding(accountId, order.symbol);
      if (existing) {
        const newQty = existing.quantity + order.quantity;
        const newAvg = ((existing.quantity * existing.avg_buy_price) + (order.quantity * order.limit_price)) / newQty;
        await db.execute({
          sql: `UPDATE paper_holding SET quantity = ?, avg_buy_price = ? WHERE id = ?`,
          args: [newQty, newAvg, existing.id],
        });
      } else {
        await db.execute({
          sql: `INSERT INTO paper_holding (account_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)`,
          args: [accountId, order.symbol, order.quantity, order.limit_price],
        });
      }
      await db.execute({
        sql: `INSERT INTO paper_trade_history (account_id, symbol, side, quantity, price, realized_pnl, fees, executed_at)
              VALUES (?, ?, 'BUY', ?, ?, NULL, ?, ?)`,
        args: [accountId, order.symbol, order.quantity, order.limit_price, fees.total, Date.now()],
      });
    } else {
      const holding = await getHolding(accountId, order.symbol);
      if (!holding) continue;
      const newQty = holding.quantity - order.quantity;
      const grossPnl = (order.limit_price - holding.avg_buy_price) * order.quantity;
      const realizedPnl = grossPnl - fees.total;
      const netProceeds = tradeValue - fees.total;
      await db.execute({
        sql: `UPDATE paper_trading_account SET cash_balance = cash_balance + ? WHERE id = ?`,
        args: [netProceeds, accountId],
      });
      if (newQty <= 0) {
        await db.execute({
          sql: `DELETE FROM paper_holding WHERE id = ?`,
          args: [holding.id],
        });
      } else {
        await db.execute({
          sql: `UPDATE paper_holding SET quantity = ? WHERE id = ?`,
          args: [newQty, holding.id],
        });
      }
      await db.execute({
        sql: `INSERT INTO paper_trade_history (account_id, symbol, side, quantity, price, realized_pnl, fees, executed_at)
              VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?)`,
        args: [accountId, order.symbol, order.quantity, order.limit_price, realizedPnl, fees.total, Date.now()],
      });
    }

    filled++;
  }

  return filled;
}

// ─── Expiry ─────────────────────────────────────────────────────────────

export async function expireStaleOrders(): Promise<number> {
  const r = await db.execute({
    sql: `UPDATE paper_order SET status = 'EXPIRED'
          WHERE status = 'PENDING' AND expires_at <= ?`,
    args: [Date.now()],
  });
  return r.rowsAffected;
}

// ─── Reset ──────────────────────────────────────────────────────────────

export async function resetAccount(accountId: number, confirmation: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!confirmation) return { ok: false, error: "Confirmation required" };

  const account = await getAccountById(accountId);
  if (!account) return { ok: false, error: "Account not found" };

  await db.execute("DELETE FROM paper_holding WHERE account_id = ?", [accountId]);

  await db.execute({
    sql: `UPDATE paper_order SET status = 'CANCELLED' WHERE account_id = ? AND status = 'PENDING'`,
    args: [accountId],
  });

  await db.execute({
    sql: `UPDATE paper_trading_account
          SET cash_balance = starting_balance,
              reset_count = reset_count + 1,
              last_reset_at = ?
          WHERE id = ?`,
    args: [Date.now(), accountId],
  });

  return { ok: true };
}

// ─── Performance ────────────────────────────────────────────────────────

export async function getPerformance(accountId: number) {
  const account = await getAccountById(accountId);
  if (!account) return null;

  const holdings = await getHoldings(accountId);
  const trades = await getTradeHistory(accountId);

  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const realizedPnl = trades
    .filter((t) => t.realized_pnl != null)
    .reduce((s, t) => s + t.realized_pnl!, 0);

  const winRate = (() => {
    const closed = trades.filter((t) => t.realized_pnl != null);
    if (!closed.length) return null;
    return closed.filter((t) => t.realized_pnl! > 0).length / closed.length;
  })();

  const avgPnl = (() => {
    const closed = trades.filter((t) => t.realized_pnl != null);
    if (!closed.length) return null;
    return closed.reduce((s, t) => s + t.realized_pnl!, 0) / closed.length;
  })();

  const bestTrade = trades.length
    ? Math.max(...trades.filter((t) => t.realized_pnl != null).map((t) => t.realized_pnl!), 0)
    : null;

  const worstTrade = trades.length
    ? Math.min(...trades.filter((t) => t.realized_pnl != null).map((t) => t.realized_pnl!), 0)
    : null;

  return {
    totalEquity: 0,
    cashBalance: account.cash_balance,
    startingBalance: account.starting_balance,
    totalReturnPct: 0,
    realizedPnl,
    totalFees,
    winRate,
    avgPnl,
    bestTrade,
    worstTrade,
    holdingCount: holdings.length,
    tradeCount: trades.length,
    resetCount: account.reset_count,
    lastResetAt: account.last_reset_at,
  };
}

// ─── Equity computation ─────────────────────────────────────────────────

export async function computeTotalEquity(
  accountId: number, ltpMap: LtpMap,
): Promise<number> {
  const account = await getAccountById(accountId);
  if (!account) return 0;
  const holdings = await getHoldings(accountId);
  let equity = account.cash_balance;
  for (const h of holdings) {
    const ltp = ltpMap[h.symbol] ?? h.avg_buy_price;
    equity += ltp * h.quantity;
  }
  return equity;
}

export async function saveEquitySnapshot(
  date: string, accountId: number, ltpMap: LtpMap,
): Promise<void> {
  const equity = await computeTotalEquity(accountId, ltpMap);
  await db.execute({
    sql: `INSERT INTO paper_equity_snapshot (date, account_id, total_equity)
          VALUES (?, ?, ?) ON CONFLICT(date, account_id) DO UPDATE SET total_equity = excluded.total_equity`,
    args: [date, accountId, equity],
  });
}

export async function getEquitySnapshots(accountId: number): Promise<EquitySnapshot[]> {
  const r = await db.execute({
    sql: `SELECT date, account_id, total_equity FROM paper_equity_snapshot WHERE account_id = ? ORDER BY date ASC`,
    args: [accountId],
  });
  return r.rows.map((row) => ({
    date: String(row.date),
    account_id: Number(row.account_id),
    total_equity: Number(row.total_equity),
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────────

function mapOrder(row: any): Order {
  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    symbol: String(row.symbol),
    side: String(row.side) as "BUY" | "SELL",
    limit_price: Number(row.limit_price),
    quantity: Number(row.quantity),
    status: String(row.status) as Order["status"],
    placed_at: Number(row.placed_at),
    expires_at: Number(row.expires_at),
    filled_at: row.filled_at != null ? Number(row.filled_at) : null,
    filled_price: row.filled_price != null ? Number(row.filled_price) : null,
  };
}

function mapHolding(row: any): Holding {
  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    symbol: String(row.symbol),
    quantity: Number(row.quantity),
    avg_buy_price: Number(row.avg_buy_price),
  };
}

function mapTrade(row: any): Trade {
  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    symbol: String(row.symbol),
    side: String(row.side) as "BUY" | "SELL",
    quantity: Number(row.quantity),
    price: Number(row.price),
    realized_pnl: row.realized_pnl != null ? Number(row.realized_pnl) : null,
    fees: Number(row.fees ?? 0),
    executed_at: Number(row.executed_at),
  };
}

function npr(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── LTP resolution (same logic as Broker Analysis — live first, DB fallback) ────────

export async function resolveLtpMap(): Promise<LtpMap> {
  // Try live API first
  try {
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/live`
      : "http://localhost:3001/api/live";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      const data = json.data ?? json;
      if (Array.isArray(data)) {
        const map: LtpMap = {};
        for (const s of data) {
          const ltp = s.lastTradedPrice ?? s.close ?? s.ltp;
          if (ltp && ltp > 0) map[s.symbol ?? s.s] = ltp;
        }
        if (Object.keys(map).length > 0) return map;
      }
    }
  } catch {}

  // Fallback: DB stocks table
  try {
    const r = await db.execute("SELECT symbol, lastTradedPrice FROM stocks WHERE lastTradedPrice > 0");
    const map: LtpMap = {};
    for (const row of r.rows) {
      map[String(row.symbol)] = Number(row.lastTradedPrice);
    }
    return map;
  } catch {
    return {};
  }
}
