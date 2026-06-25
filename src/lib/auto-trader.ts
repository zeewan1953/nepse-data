import { db } from "@/lib/db";
import { buildSignalsFromLiveData } from "@/lib/signal-engine";
import { calcFees, MIN_LOT_SIZE } from "@/lib/demo/fees";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";

export type AutoTradeAction = {
  timestamp: string;
  type: "BUY" | "SELL" | "NOOP" | "SL_HIT" | "TP_HIT";
  symbol?: string;
  qty?: number;
  price?: number;
  confidence?: number;
  reason: string;
  balanceAfter?: number;
  exitType?: string;
};

export type Position = {
  symbol: string;
  qty: number;
  avgCost: number;
  slPrice: number;
  tpPrice: number;
};

export type AutoTraderState = {
  balance: number;
  positions: Position[];
  trades: AutoTradeAction[];
  totalInvested: number;
  totalReturn: number;
  monthlyPnL: MonthlyPnL[];
};

export type MonthlyPnL = {
  month: string;
  trades: number;
  buys: number;
  sells: number;
  realizedPnL: number;
  balanceStart: number;
  balanceEnd: number;
};

const STARTING_BALANCE = 5_000_000;
const MAX_POSITIONS = 5;
const MAX_PER_STOCK = 500_000;
const MIN_CONFIDENCE = 60;
const TICK_INTERVAL_MINUTES = 3;
const SL_PCT = 0.025; // 2.5% stop loss
const TP_PCT = 0.075; // 7.5% take profit → 1:3 risk-reward

export function isMarketHours(): boolean {
  const now = new Date();
  const npt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const day = npt.getDay();
  if (day > 4) return false;
  const totalMins = npt.getHours() * 60 + npt.getMinutes();
  return totalMins >= 11 * 60 && totalMins < 15 * 60;
}

async function ensureTables(): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS auto_trader_state (id INTEGER PRIMARY KEY CHECK (id = 1), balance REAL NOT NULL DEFAULT 5000000, updated_at TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS auto_trader_positions (symbol TEXT PRIMARY KEY, qty INTEGER NOT NULL, avg_cost REAL NOT NULL, sl_price REAL NOT NULL DEFAULT 0, tp_price REAL NOT NULL DEFAULT 0)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS auto_trader_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, type TEXT NOT NULL, symbol TEXT, qty INTEGER, price REAL, confidence REAL, reason TEXT NOT NULL, balance_after REAL, exit_type TEXT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS auto_trader_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS auto_trader_pnl (month TEXT PRIMARY KEY, trades INTEGER DEFAULT 0, buys INTEGER DEFAULT 0, sells INTEGER DEFAULT 0, realized_pnl REAL DEFAULT 0, balance_start REAL, balance_end REAL)`);
}

// ——— Schedule ———
export async function scheduleNextTick(): Promise<void> {
  const next = Date.now() + TICK_INTERVAL_MINUTES * 60_000;
  await db.execute({
    sql: `INSERT INTO auto_trader_config (key, value) VALUES ('next_tick_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [String(next)],
  });
}

export async function isTickDue(): Promise<boolean> {
  const r = await db.execute("SELECT value FROM auto_trader_config WHERE key = 'next_tick_at'");
  if (!r.rows.length) return true;
  const next = parseInt(String(r.rows[0].value), 10);
  return Date.now() >= next;
}

// ——— Monthly P&L ———
async function updateMonthlyPnL(action: AutoTradeAction): Promise<void> {
  if (action.type === "NOOP") return;
  const month = new Date(action.timestamp).toISOString().slice(0, 7);
  const isBuy = action.type === "BUY" ? 1 : 0;
  const isSell = action.type === "SELL" ? 1 : 0;
  const pnl = action.type === "SELL" && action.price && action.qty ? action.price * action.qty : 0;

  // Get existing or create new monthly record
  const existing = await db.execute({
    sql: "SELECT trades, balance_start, balance_end FROM auto_trader_pnl WHERE month = ?",
    args: [month],
  });

  if (!existing.rows.length) {
    const balanceBefore = await getBalance();
    await db.execute({
      sql: `INSERT INTO auto_trader_pnl (month, trades, buys, sells, realized_pnl, balance_start, balance_end) VALUES (?, 1, ?, ?, ?, ?, ?)`,
      args: [month, isBuy, isSell, pnl, balanceBefore, action.balanceAfter ?? balanceBefore],
    });
  } else {
    const row = existing.rows[0];
    const oldEnd = Number(row.balance_end);
    const oldStart = Number(row.balance_start);
    await db.execute({
      sql: `UPDATE auto_trader_pnl SET trades = trades + 1, buys = buys + ?, sells = sells + ?, realized_pnl = realized_pnl + ?, balance_end = ? WHERE month = ?`,
      args: [isBuy, isSell, pnl, action.balanceAfter ?? oldEnd, month],
    });
  }
}

async function getBalance(): Promise<number> {
  const r = await db.execute("SELECT balance FROM auto_trader_state WHERE id = 1");
  return r.rows.length ? Number(r.rows[0].balance) : STARTING_BALANCE;
}

// ——— State ———
export async function getState(): Promise<AutoTraderState> {
  await ensureTables();
  const balance = await getBalance();

  const pr = await db.execute("SELECT symbol, qty, avg_cost, sl_price, tp_price FROM auto_trader_positions");
  const positions = pr.rows.map((r) => ({
    symbol: String(r.symbol),
    qty: Number(r.qty),
    avgCost: Number(r.avg_cost),
    slPrice: Number(r.sl_price ?? 0),
    tpPrice: Number(r.tp_price ?? 0),
  }));

  const tr = await db.execute("SELECT timestamp, type, symbol, qty, price, confidence, reason, balance_after, exit_type FROM auto_trader_trades ORDER BY id DESC LIMIT 100");
  const trades = tr.rows.map((r) => ({
    timestamp: String(r.timestamp),
    type: String(r.type) as AutoTradeAction["type"],
    symbol: r.symbol != null ? String(r.symbol) : undefined,
    qty: r.qty != null ? Number(r.qty) : undefined,
    price: r.price != null ? Number(r.price) : undefined,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
    reason: String(r.reason),
    balanceAfter: r.balance_after != null ? Number(r.balance_after) : undefined,
    exitType: r.exit_type != null ? String(r.exit_type) : undefined,
  }));

  const totalInvested = positions.reduce((s, p) => s + p.avgCost * p.qty, 0);
  const totalReturn = balance + totalInvested - STARTING_BALANCE;

  const pnlr = await db.execute("SELECT month, trades, buys, sells, realized_pnl, balance_start, balance_end FROM auto_trader_pnl ORDER BY month DESC LIMIT 12");
  const monthlyPnL = pnlr.rows.map((r) => ({
    month: String(r.month),
    trades: Number(r.trades),
    buys: Number(r.buys),
    sells: Number(r.sells),
    realizedPnL: Number(r.realized_pnl),
    balanceStart: Number(r.balance_start),
    balanceEnd: Number(r.balance_end),
  }));

  return { balance, positions, trades, totalInvested, totalReturn, monthlyPnL };
}

async function saveBalance(balance: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO auto_trader_state (id, balance, updated_at) VALUES (1, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`,
    args: [balance],
  });
}

async function addTrade(action: AutoTradeAction): Promise<void> {
  await db.execute({
    sql: `INSERT INTO auto_trader_trades (timestamp, type, symbol, qty, price, confidence, reason, balance_after, exit_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [action.timestamp, action.type, action.symbol ?? null, action.qty ?? null, action.price ?? null, action.confidence ?? null, action.reason, action.balanceAfter ?? null, action.exitType ?? null],
  });
  await updateMonthlyPnL(action);
}

// ——— Core engine ———
export async function runAutoTrader(): Promise<{ actions: AutoTradeAction[]; summary: string }> {
  const actions: AutoTradeAction[] = [];

  if (!isMarketHours()) {
    // Schedule next check a minute before market opens tomorrow
    await scheduleNextTick();
    return { actions: [], summary: "Market closed. NEPSE hours: Sun-Thu 11:00-15:00 NPT." };
  }

  const state = await getState();

  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length) {
    await scheduleNextTick();
    return { actions: [], summary: "No live market data available from MeroLagani." };
  }

  const priceMap = new Map(mero.stock.detail.map((s) => [s.s, s.lp]));
  const { signals } = await buildSignalsFromLiveData();
  const heldSymbols = new Set(state.positions.map((p) => p.symbol));

  // BUY
  const buyCandidates = signals
    .filter((s) => s.signal === "BUY" && s.confidence >= MIN_CONFIDENCE && !heldSymbols.has(s.symbol))
    .sort((a, b) => b.confidence - a.confidence);

  let availableSlots = MAX_POSITIONS - state.positions.length;
  let buys = 0;
  for (const candidate of buyCandidates) {
    if (buys >= availableSlots) break;
    const ltp = priceMap.get(candidate.symbol);
    if (!ltp || ltp <= 0) continue;

    const qty = Math.max(MIN_LOT_SIZE, Math.floor(MAX_PER_STOCK / ltp / 10) * 10);
    const fees = calcFees("buy", qty, ltp);
    const totalCost = fees.tradeValue + fees.total;
    if (totalCost > state.balance) continue;

    state.balance -= totalCost;
    const slPrice = Math.round((ltp * (1 - SL_PCT)) * 100) / 100;
    const tpPrice = Math.round((ltp * (1 + TP_PCT)) * 100) / 100;
    state.positions.push({ symbol: candidate.symbol, qty, avgCost: ltp, slPrice, tpPrice });

    actions.push({
      timestamp: new Date().toISOString(),
      type: "BUY",
      symbol: candidate.symbol, qty, price: ltp,
      confidence: candidate.confidence,
      reason: `Signal: ${candidate.reason} | SL: ${slPrice} (-${(SL_PCT * 100).toFixed(1)}%) TP: ${tpPrice} (+${(TP_PCT * 100).toFixed(1)}%)`,
      balanceAfter: state.balance,
    });
    buys++;
  }

  // SELL: SL / TP / Signal-based
  for (const pos of [...state.positions]) {
    const sig = signals.find((s) => s.symbol === pos.symbol);
    const ltp = priceMap.get(pos.symbol);
    if (!ltp || ltp <= 0) continue;

    let shouldSell = false;
    let exitType = "";
    let reason = "";

    // Check stop loss
    if (pos.slPrice > 0 && ltp <= pos.slPrice) {
      shouldSell = true;
      exitType = "SL_HIT";
      const lossPct = ((ltp - pos.avgCost) / pos.avgCost * 100).toFixed(1);
      reason = `Stop loss hit: LTP ${ltp} ≤ SL ${pos.slPrice} (${lossPct}%)`;
    }
    // Check take profit
    else if (pos.tpPrice > 0 && ltp >= pos.tpPrice) {
      shouldSell = true;
      exitType = "TP_HIT";
      const gainPct = ((ltp - pos.avgCost) / pos.avgCost * 100).toFixed(1);
      reason = `Take profit hit: LTP ${ltp} ≥ TP ${pos.tpPrice} (${gainPct}%)`;
    }
    // Check signal-based exit
    else if (sig) {
      if (sig.signal === "SELL") {
        shouldSell = true;
        exitType = "SIGNAL_SELL";
        reason = `Signal reversed: ${sig.reason}`;
      } else if (sig.signal === "NEUTRAL" && sig.confidence < 20) {
        shouldSell = true;
        exitType = "SIGNAL_WEAK";
        reason = `Signal turned weak (conf ${sig.confidence}%)`;
      }
    }

    if (shouldSell) {
      const proceeds = ltp * pos.qty;
      state.balance += proceeds;
      state.positions = state.positions.filter((p) => p.symbol !== pos.symbol);

      actions.push({
        timestamp: new Date().toISOString(),
        type: "SELL",
        symbol: pos.symbol, qty: pos.qty, price: ltp,
        reason,
        balanceAfter: state.balance,
        exitType,
      });
    }
  }

  await saveBalance(state.balance);

  for (const a of actions) {
    await addTrade(a);
    if (a.symbol) {
      await db.execute({
        sql: `INSERT INTO trade_decision_log (timestamp, stock_symbol, cmf, mfi, vol_zscore, smart_money_score, signal, confidence, data_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [a.timestamp, a.symbol, null, null, null, null, a.type, a.confidence ?? 0, "auto-trader"],
      });
    }
  }

  // Schedule next tick
  await scheduleNextTick();

  const summary = actions.length > 0
    ? `${actions.length} trade(s): ${actions.filter(a => a.type === "BUY").length} buys, ${actions.filter(a => a.type === "SELL").length} sells. Balance: Rs ${state.balance.toFixed(0)}.`
    : `No trades. ${state.positions.length}/${MAX_POSITIONS} positions. Balance: Rs ${state.balance.toFixed(0)}.`;

  return { actions, summary };
}

// ——— Tick (lightweight) ———
export async function tickAutoTrader(): Promise<{ ran: boolean; summary: string }> {
  if (!isMarketHours()) return { ran: false, summary: "Market closed" };
  const due = await isTickDue();
  if (!due) return { ran: false, summary: "Tick not due yet" };
  const result = await runAutoTrader();
  return { ran: result.actions.length > 0, summary: result.summary };
}

// ——— Monthly P&L summary ———
export async function getMonthlyPnL(): Promise<MonthlyPnL[]> {
  await ensureTables();
  const r = await db.execute("SELECT month, trades, buys, sells, realized_pnl, balance_start, balance_end FROM auto_trader_pnl ORDER BY month DESC LIMIT 12");
  return r.rows.map((r) => ({
    month: String(r.month),
    trades: Number(r.trades),
    buys: Number(r.buys),
    sells: Number(r.sells),
    realizedPnL: Number(r.realized_pnl),
    balanceStart: Number(r.balance_start),
    balanceEnd: Number(r.balance_end),
  }));
}

export async function resetAutoTrader(): Promise<void> {
  await ensureTables();
  await db.execute("DELETE FROM auto_trader_state");
  await db.execute("DELETE FROM auto_trader_positions");
  await db.execute("DELETE FROM auto_trader_trades");
  await db.execute("DELETE FROM auto_trader_config");
  await db.execute("DELETE FROM auto_trader_pnl");
}
