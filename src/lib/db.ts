import "server-only";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import type { InArgs } from "@libsql/client";

// ─── SQLite database (auth + OHLC market data) ────────────────────────────
const DB_DIR = process.env.VERCEL === "1" ? "/tmp" : path.join(process.cwd(), "data");

function getDbUrl(): string {
  if (process.env.VERCEL === "1") {
    const tmpDb = path.join("/tmp", "darisir.db");
    // Copy seed DB to /tmp on first cold start
    if (!fs.existsSync(tmpDb)) {
      const seedPath = path.join(process.cwd(), "seed", "darisir.db");
      if (fs.existsSync(seedPath)) {
        fs.cpSync(seedPath, tmpDb);
      }
    }
    return pathToFileURL(tmpDb).href;
  }
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  return pathToFileURL(path.join(DB_DIR, "darisir.db")).href;
}

// ─── Client: Turso (remote libsql) when configured, else local file ────────
// Set TURSO_DATABASE_URL (libsql://...) + TURSO_AUTH_TOKEN to use a shared
// remote DB that BOTH Vercel and GitHub Actions can read/write. Without them,
// fall back to the local SQLite file (dev / current behavior).
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

export const db = tursoUrl
  ? createClient({ url: tursoUrl, authToken: tursoToken })
  : createClient({ url: getDbUrl() });

type SqlArgs = InArgs;

// ─── Schema migrations ───────────────────────────────────────────────────
async function migrateSchema(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      mobile TEXT,
      name TEXT,
      passwordHash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add createdAt column to sessions if missing
  try {
    await db.execute("ALTER TABLE sessions ADD COLUMN createdAt INTEGER DEFAULT 0");
  } catch {
    // already exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS otps (
      email TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS live_ohlc (
      symbol TEXT PRIMARY KEY,
      openPrice REAL NOT NULL,
      highPrice REAL NOT NULL,
      lowPrice REAL NOT NULL,
      averageTradedPrice REAL NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // All NEPSE stocks for search
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stocks (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lastTradedPrice REAL NOT NULL DEFAULT 0,
      percentageChange REAL NOT NULL DEFAULT 0,
      totalTradeQuantity REAL NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    )
  `);

  // Floorsheet trades stored by date for historical querying
  await db.execute(`
    CREATE TABLE IF NOT EXISTS floorsheet_trades (
      tradeDate TEXT NOT NULL,
      stockSymbol TEXT NOT NULL,
      securityName TEXT NOT NULL,
      buyerMemberId TEXT NOT NULL,
      sellerMemberId TEXT NOT NULL,
      contractQuantity REAL NOT NULL,
      contractAmount REAL NOT NULL,
      tradeOrder INTEGER NOT NULL DEFAULT 0,
      syncedAt INTEGER NOT NULL
    )
  `);

  // Pre-computed daily broker-stock aggregation for fast rolling queries
  await db.execute(`
    CREATE TABLE IF NOT EXISTS broker_daily_agg (
      tradeDate TEXT NOT NULL,
      stockSymbol TEXT NOT NULL,
      brokerId TEXT NOT NULL,
      buyQty REAL NOT NULL DEFAULT 0,
      buyAmt REAL NOT NULL DEFAULT 0,
      sellQty REAL NOT NULL DEFAULT 0,
      sellAmt REAL NOT NULL DEFAULT 0,
      netQty REAL NOT NULL DEFAULT 0,
      netAmt REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (tradeDate, stockSymbol, brokerId)
    )
  `);

  // Daily OHLCV for CMF/MFI calculations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stock_daily_ohlcv (
      tradeDate TEXT NOT NULL,
      symbol TEXT NOT NULL,
      open REAL NOT NULL DEFAULT 0,
      high REAL NOT NULL DEFAULT 0,
      low REAL NOT NULL DEFAULT 0,
      close REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      value REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (tradeDate, symbol)
    )
  `);

  // Intraday 1-minute OHLCV candles for TradingView charts
  await db.execute(`
    CREATE TABLE IF NOT EXISTS intraday_candles (
      symbol TEXT NOT NULL,
      ts INTEGER NOT NULL,
      open REAL NOT NULL DEFAULT 0,
      high REAL NOT NULL DEFAULT 0,
      low REAL NOT NULL DEFAULT 0,
      close REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (symbol, ts)
    )
  `);

  // Add status column for finalized/provisional tracking
  try {
    await db.execute("ALTER TABLE broker_daily_agg ADD COLUMN status TEXT NOT NULL DEFAULT 'provisional'");
  } catch {
    // already exists
  }
  try {
    await db.execute("ALTER TABLE broker_daily_agg ADD COLUMN finalizedAt INTEGER");
  } catch {
    // already exists
  }

  // Broker daily summary (per spec: broker-wise buy/sell/holding)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS broker_daily_summary (
      tradeDate TEXT NOT NULL,
      symbol TEXT NOT NULL,
      brokerCode TEXT NOT NULL,
      buyQty REAL NOT NULL DEFAULT 0,
      sellQty REAL NOT NULL DEFAULT 0,
      netQty REAL NOT NULL DEFAULT 0,
      buyAmt REAL NOT NULL DEFAULT 0,
      sellAmt REAL NOT NULL DEFAULT 0,
      buyContracts INTEGER NOT NULL DEFAULT 0,
      sellContracts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'provisional',
      finalizedAt INTEGER,
      PRIMARY KEY (tradeDate, symbol, brokerCode)
    )
  `);

  // Indexes for fast floorsheet queries
  try {
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_date ON floorsheet_trades(tradeDate)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_buyer ON floorsheet_trades(tradeDate, buyerMemberId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_seller ON floorsheet_trades(tradeDate, sellerMemberId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_stock ON floorsheet_trades(tradeDate, stockSymbol)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_fs_order ON floorsheet_trades(tradeDate, stockSymbol, tradeOrder)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_bda_symbol ON broker_daily_agg(stockSymbol, tradeDate)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_bda_broker ON broker_daily_agg(tradeDate, brokerId)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol ON stock_daily_ohlcv(symbol, tradeDate)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_intraday_symbol_ts ON intraday_candles(symbol, ts)");
  } catch { /* indexes may already exist */ }

  // MeroLagani daily broker summary (REAL data from MeroLagani API)
  // Saved at 3:30 PM daily after market close
  await db.execute(`
    CREATE TABLE IF NOT EXISTS merolagani_broker_daily (
      tradeDate TEXT NOT NULL,
      brokerCode TEXT NOT NULL,
      brokerName TEXT NOT NULL,
      purchaseAmt REAL NOT NULL DEFAULT 0,
      sellAmt REAL NOT NULL DEFAULT 0,
      netAmt REAL NOT NULL DEFAULT 0,
      totalAmt REAL NOT NULL DEFAULT 0,
      savedAt INTEGER NOT NULL,
      PRIMARY KEY (tradeDate, brokerCode)
    )
  `);

  // Pipeline run log — prevents duplicate daily broker scrapes
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pipeline_run_log (
      run_date TEXT PRIMARY KEY,
      pipeline TEXT NOT NULL DEFAULT 'broker_ingest',
      status TEXT NOT NULL,
      rows_written INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `);

  // Broker flow analytics cache — stores computed JSON per date+section
  await db.execute(`
    CREATE TABLE IF NOT EXISTS broker_flow_cache (
      date TEXT NOT NULL,
      section TEXT NOT NULL,
      payload TEXT NOT NULL,
      savedAt INTEGER NOT NULL,
      PRIMARY KEY (date, section)
    )
  `);

  // Add createdAt column if missing
  try {
    await db.execute("ALTER TABLE otps ADD COLUMN createdAt INTEGER DEFAULT 0");
  } catch {
    // already exists
  }

  // Add unique index on otps email for upsert safety
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_otps_email ON otps(email)");
  } catch {
    // index may already exist or table was created differently
  }

  // ─── Paper Trading Tables ────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS paper_trading_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      cash_balance REAL NOT NULL DEFAULT 1000000.00,
      starting_balance REAL NOT NULL DEFAULT 1000000.00,
      created_at INTEGER NOT NULL,
      reset_count INTEGER NOT NULL DEFAULT 0,
      last_reset_at INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paper_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES paper_trading_account(id),
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
      limit_price REAL NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','FILLED','EXPIRED','CANCELLED')),
      placed_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      filled_at INTEGER,
      filled_price REAL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_paper_order_pending ON paper_order (status, symbol) WHERE status = 'PENDING'`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paper_holding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES paper_trading_account(id),
      symbol TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      avg_buy_price REAL NOT NULL,
      UNIQUE (account_id, symbol)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paper_trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES paper_trading_account(id),
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      realized_pnl REAL,
      fees REAL NOT NULL DEFAULT 0,
      executed_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paper_equity_snapshot (
      date TEXT NOT NULL,
      account_id INTEGER NOT NULL REFERENCES paper_trading_account(id),
      total_equity REAL NOT NULL,
      PRIMARY KEY (date, account_id)
    )
  `);

  // Add fees column to paper_trade_history if missing
  try {
    await db.execute("ALTER TABLE paper_trade_history ADD COLUMN fees REAL NOT NULL DEFAULT 0");
  } catch {}

  // Add hash + buy/sell qty columns to merolagani_broker_daily for change detection
  try {
    await db.execute("ALTER TABLE merolagani_broker_daily ADD COLUMN hash TEXT");
  } catch { /* already exists */ }
  try {
    await db.execute("ALTER TABLE merolagani_broker_daily ADD COLUMN buyQty REAL DEFAULT 0");
  } catch { /* already exists */ }
  try {
    await db.execute("ALTER TABLE merolagani_broker_daily ADD COLUMN sellQty REAL DEFAULT 0");
  } catch { /* already exists */ }

  // Sync logs — records every collection run for monitoring/debugging
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      broker_date TEXT,
      broker_count INTEGER DEFAULT 0,
      broker_action TEXT,
      floorsheet_date TEXT,
      floorsheet_trades INTEGER DEFAULT 0,
      floorsheet_action TEXT,
      duration_ms INTEGER DEFAULT 0,
      error TEXT
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sync_logs_ts ON sync_logs(ts)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sync_logs_date ON sync_logs(broker_date)`);

  // Error logs — permanent failure records
  await db.execute(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      source TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'error',
      message TEXT NOT NULL,
      stack TEXT,
      context TEXT
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_error_logs_ts ON error_logs(ts)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source)`);

  // Self-healer action log
  await db.execute(`
    CREATE TABLE IF NOT EXISTS healer_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `);

  // Company fundamentals — EPS, PE, paid-up capital, quarterly growth, etc.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS company_fundamentals (
      symbol TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      sector TEXT,
      eps NUMERIC,
      pe_ratio NUMERIC,
      paid_up_capital NUMERIC,
      net_profit NUMERIC,
      q1_growth_pct NUMERIC,
      q2_growth_pct NUMERIC,
      q3_growth_pct NUMERIC,
      q4_growth_pct NUMERIC,
      book_value NUMERIC,
      dividend_pct NUMERIC,
      market_cap NUMERIC,
      shares_outstanding NUMERIC,
      roe NUMERIC,
      pbv NUMERIC,
      debt_equity NUMERIC,
      fifty_two_week_range TEXT,
      last_updated DATE NOT NULL,
      source TEXT NOT NULL
    )
  `);

  // Company news headlines
  await db.execute(`
    CREATE TABLE IF NOT EXISTS company_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      headline TEXT NOT NULL,
      published_at TEXT NOT NULL,
      url TEXT,
      source TEXT NOT NULL DEFAULT 'merolagani',
      FOREIGN KEY (symbol) REFERENCES company_fundamentals(symbol)
    )
  `);

  // Index for news lookups
  try {
    await db.execute("CREATE INDEX IF NOT EXISTS idx_company_news_symbol ON company_news(symbol)");
  } catch {}

  // ── User Alerts ──────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      alert_type TEXT NOT NULL CHECK (alert_type IN ('price','signal','broker_flow')),
      symbol TEXT,
      broker_id TEXT,
      signal_name TEXT,
      condition TEXT NOT NULL CHECK (condition IN ('above','below','crosses_up','crosses_down')),
      threshold NUMERIC NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_triggered_at INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS alert_trigger_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL,
      triggered_at INTEGER NOT NULL,
      observed_value NUMERIC,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (alert_id) REFERENCES user_alerts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh_key TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    await db.execute("CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON user_alerts(user_id)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_alert_trigger_log_alert ON alert_trigger_log(alert_id)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_alert_trigger_log_read ON alert_trigger_log(is_read)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)");
  } catch {}

  // ── Signal Daily Snapshot (append-only) ────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS signal_daily_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      signal_name TEXT NOT NULL,
      signal_value NUMERIC,
      computed_at INTEGER NOT NULL
    )
  `);
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_snapshot_uniq ON signal_daily_snapshot(trade_date, symbol, signal_name)");
  } catch {}

  // ── Signal Performance Summary ─────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS signal_performance_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_name TEXT NOT NULL,
      horizon_days INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      hit_rate NUMERIC,
      avg_top_quintile_return NUMERIC,
      avg_baseline_return NUMERIC,
      sample_size INTEGER NOT NULL,
      computed_at INTEGER NOT NULL
    )
  `);
  try {
    await db.execute("CREATE INDEX IF NOT EXISTS idx_signal_perf_lookup ON signal_performance_summary(signal_name, horizon_days, window_end)");
  } catch {}
}
migrateSchema().catch(console.error);

// ─── Query helpers ───────────────────────────────────────────────────────
export async function execute(sql: string, args?: SqlArgs) {
  return db.execute(sql, args);
}

export async function one<T = unknown>(sql: string, args?: SqlArgs): Promise<T | undefined> {
  const result = await execute(sql, args);
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function run(sql: string, args?: SqlArgs) {
  return execute(sql, args);
}

// ─── OHLC market data ────────────────────────────────────────────────────
type OhlcRow = {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  averageTradedPrice: number;
};

export async function saveLiveSnapshot(live: Array<OhlcRow>): Promise<void> {
  if (!live.length) return;

  const statements = live.map((row) => ({
    sql: `INSERT INTO live_ohlc(symbol, openPrice, highPrice, lowPrice, averageTradedPrice, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            openPrice=excluded.openPrice,
            highPrice=excluded.highPrice,
            lowPrice=excluded.lowPrice,
            averageTradedPrice=excluded.averageTradedPrice,
            updatedAt=excluded.updatedAt`,
    args: [row.symbol, row.openPrice, row.highPrice, row.lowPrice, row.averageTradedPrice, Date.now()],
  }));

  await db.batch(statements, "write");
}

export async function getOhlcMap(): Promise<Map<string, OhlcRow>> {
  const result = await db.execute(
    "SELECT symbol, openPrice, highPrice, lowPrice, averageTradedPrice FROM live_ohlc",
  );
  return new Map(
    result.rows.map((row) => [
      String(row.symbol),
      {
        symbol: String(row.symbol),
        openPrice: Number(row.openPrice),
        highPrice: Number(row.highPrice),
        lowPrice: Number(row.lowPrice),
        averageTradedPrice: Number(row.averageTradedPrice),
      },
    ]),
  );
}

// ─── Stock search table ────────────────────────────────────────────────────
export type StockRow = {
  symbol: string;
  name: string;
  lastTradedPrice: number;
  percentageChange: number;
  totalTradeQuantity: number;
};

export async function saveStocks(stocks: StockRow[]): Promise<void> {
  if (!stocks.length) return;
  const now = Date.now();
  const statements = stocks.map((s) => ({
    sql: `INSERT INTO stocks(symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            name=excluded.name,
            lastTradedPrice=excluded.lastTradedPrice,
            percentageChange=excluded.percentageChange,
            totalTradeQuantity=excluded.totalTradeQuantity,
            updatedAt=excluded.updatedAt`,
    args: [s.symbol, s.name, s.lastTradedPrice, s.percentageChange, s.totalTradeQuantity, now],
  }));
  await db.batch(statements, "write");
}

export async function searchStocks(q: string): Promise<StockRow[]> {
  const query = `%${q}%`;
  const result = await db.execute({
    sql: "SELECT symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY symbol LIMIT 50",
    args: [query, query],
  });
  return result.rows.map((r) => ({
    symbol: String(r.symbol),
    name: String(r.name),
    lastTradedPrice: Number(r.lastTradedPrice),
    percentageChange: Number(r.percentageChange),
    totalTradeQuantity: Number(r.totalTradeQuantity),
  }));
}

export async function getAllStocks(): Promise<StockRow[]> {
  const result = await db.execute(
    "SELECT symbol, name, lastTradedPrice, percentageChange, totalTradeQuantity FROM stocks ORDER BY symbol",
  );
  return result.rows.map((r) => ({
    symbol: String(r.symbol),
    name: String(r.name),
    lastTradedPrice: Number(r.lastTradedPrice),
    percentageChange: Number(r.percentageChange),
    totalTradeQuantity: Number(r.totalTradeQuantity),
  }));
}

// ─── Floorsheet trades (DB-backed) ────────────────────────────────────────
export type FsTrade = {
  tradeDate: string;
  stockSymbol: string;
  securityName: string;
  buyerMemberId: string;
  sellerMemberId: string;
  contractQuantity: number;
  contractAmount: number;
  tradeOrder?: number;
};

export async function saveFloorsheetTrades(date: string, trades: FsTrade[]): Promise<void> {
  if (!trades.length) return;
  const now = Date.now();
  // Delete existing trades + agg for this date and re-insert
  await db.execute("DELETE FROM floorsheet_trades WHERE tradeDate = ?", [date]);
  await db.execute("DELETE FROM broker_daily_agg WHERE tradeDate = ?", [date]);
  // Batch insert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < trades.length; i += CHUNK) {
    const chunk = trades.slice(i, i + CHUNK);
    const statements = chunk.map((t, idx) => ({
      sql: `INSERT INTO floorsheet_trades(tradeDate, stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount, tradeOrder, syncedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [t.tradeDate, t.stockSymbol, t.securityName, t.buyerMemberId, t.sellerMemberId, t.contractQuantity, t.contractAmount, t.tradeOrder ?? (i + idx), now],
    }));
    await db.batch(statements, "write");
  }
}

// Save broker daily aggregation
export async function saveBrokerDailyAgg(date: string, aggs: Array<{ tradeDate: string; stockSymbol: string; brokerId: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number }>): Promise<void> {
  if (!aggs.length) return;
  await db.execute("DELETE FROM broker_daily_agg WHERE tradeDate = ?", [date]);
  const CHUNK = 500;
  for (let i = 0; i < aggs.length; i += CHUNK) {
    const chunk = aggs.slice(i, i + CHUNK);
    const statements = chunk.map((a) => ({
      sql: `INSERT INTO broker_daily_agg(tradeDate, stockSymbol, brokerId, buyQty, buyAmt, sellQty, sellAmt, netQty, netAmt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [a.tradeDate, a.stockSymbol, a.brokerId, a.buyQty, a.buyAmt, a.sellQty, a.sellAmt, a.netQty, a.netAmt],
    }));
    await db.batch(statements, "write");
  }
}

// Save daily OHLCV
export async function saveDailyOhlcv(date: string, rows: Array<{ symbol: string; open: number; high: number; low: number; close: number; volume: number; value: number }>): Promise<void> {
  if (!rows.length) return;
  const statements = rows.map((r) => ({
    sql: `INSERT INTO stock_daily_ohlcv(tradeDate, symbol, open, high, low, close, volume, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tradeDate, symbol) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, value=excluded.value`,
    args: [date, r.symbol, r.open, r.high, r.low, r.close, r.volume, r.value],
  }));
  await db.batch(statements, "write");
}

// Save OHLCV from MeroLagani turnover data (has O/H/L/C/Q)
export async function syncMeroOhlcv(date: string, turnover: Array<{ s: string; op: number; h: number; l: number; lp: number; q: number; t: number }>): Promise<number> {
  if (!turnover.length || !date) return 0;
  const rows = turnover
    .filter((t) => t.op > 0 && t.lp > 0)
    .map((t) => ({
      symbol: t.s,
      open: t.op,
      high: t.h,
      low: t.l,
      close: t.lp,
      volume: t.q,
      value: t.t,
    }));
  if (!rows.length) return 0;
  await saveDailyOhlcv(date, rows);
  return rows.length;
}

export async function getFloorsheetCount(date: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM floorsheet_trades WHERE tradeDate = ?", args: [date] });
  return Number(r.rows[0]?.cnt ?? 0);
}

export async function getAvailableDates(): Promise<string[]> {
  const r = await db.execute("SELECT DISTINCT tradeDate FROM floorsheet_trades ORDER BY tradeDate DESC LIMIT 30");
  return r.rows.map((row) => String(row.tradeDate));
}

// Get latest floorsheet data from DB (fallback when API is down)
export async function getLatestFloorsheetFromDb(): Promise<FsTrade[]> {
  const r = await db.execute(
    "SELECT tradeDate, stockSymbol, securityName, buyerMemberId, sellerMemberId, contractQuantity, contractAmount, tradeOrder FROM floorsheet_trades ORDER BY tradeDate DESC, tradeOrder ASC LIMIT 10000"
  );
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    stockSymbol: String(row.stockSymbol),
    securityName: String(row.securityName),
    buyerMemberId: String(row.buyerMemberId),
    sellerMemberId: String(row.sellerMemberId),
    contractQuantity: Number(row.contractQuantity),
    contractAmount: Number(row.contractAmount),
    tradeOrder: Number(row.tradeOrder),
  }));
}

// ─── OHLCV candles from DB for signal generation ─────────────────────────
export type OhlcvCandle = {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function getCandlesFromDb(symbol: string, limit = 300): Promise<OhlcvCandle[]> {
  const r = await db.execute({
    sql: "SELECT tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT ?",
    args: [symbol, limit],
  });
  return r.rows
    .map((row) => ({
      tradeDate: String(row.tradeDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .reverse(); // oldest first
}

// ─── Broker flow from DB (broker_daily_agg) ──────────────────────────────
export type BrokerFlowRow = {
  stockSymbol: string;
  buyerId: string;
  buyerNet: number;
  sellerId: string;
  sellerNet: number;
  bias: "accumulate" | "distribute" | "neutral";
};

export async function getBrokerFlowFromDb(date?: string): Promise<Map<string, BrokerFlowRow>> {
  const targetDate = date ?? (await db.execute(
    "SELECT MAX(tradeDate) as d FROM broker_daily_agg"
  )).rows[0]?.d;
  if (!targetDate) return new Map();

  const r = await db.execute({
    sql: `SELECT stockSymbol, brokerId,
          SUM(buyQty) as buyQty, SUM(sellQty) as sellQty
          FROM broker_daily_agg
          WHERE tradeDate = ?
          GROUP BY stockSymbol, brokerId`,
    args: [String(targetDate)],
  });

  const byStock = new Map<string, Map<string, { buy: number; sell: number }>>();
  for (const row of r.rows) {
    const sym = String(row.stockSymbol);
    const broker = String(row.brokerId);
    const buy = Number(row.buyQty);
    const sell = Number(row.sellQty);
    const m = byStock.get(sym) ?? new Map();
    const prev = m.get(broker) ?? { buy: 0, sell: 0 };
    m.set(broker, { buy: prev.buy + buy, sell: prev.sell + sell });
    byStock.set(sym, m);
  }

  const out = new Map<string, BrokerFlowRow>();
  for (const [symbol, brokers] of byStock) {
    let buyerId = "", buyerNet = -Infinity, sellerId = "", sellerNet = Infinity;
    for (const [id, { buy, sell }] of brokers) {
      const net = buy - sell;
      if (net > buyerNet) { buyerNet = net; buyerId = id; }
      if (net < sellerNet) { sellerNet = net; sellerId = id; }
    }
    const bias = buyerNet > -sellerNet * 1.2 ? "accumulate"
      : -sellerNet > buyerNet * 1.2 ? "distribute" : "neutral";
    out.set(symbol, {
      stockSymbol: symbol,
      buyerId, buyerNet: Math.round(buyerNet),
      sellerId, sellerNet: Math.round(sellerNet),
      bias,
    });
  }
  return out;
}

// ─── Intraday candles (1-min OHLCV for TradingView UDF) ──────────────
export type IntradayCandle = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function saveIntradayCandles(symbol: string, candles: IntradayCandle[]): Promise<void> {
  if (!candles.length) return;
  const statements = candles.map((c) => ({
    sql: `INSERT INTO intraday_candles(symbol, ts, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, ts) DO UPDATE SET
            open=excluded.open, high=excluded.high, low=excluded.low,
            close=excluded.close, volume=excluded.volume`,
    args: [symbol, c.ts, c.open, c.high, c.low, c.close, c.volume],
  }));
  await db.batch(statements, "write");
}

export async function getIntradayCandles(symbol: string, from?: number, to?: number, limit = 500): Promise<IntradayCandle[]> {
  let sql = "SELECT ts, open, high, low, close, volume FROM intraday_candles WHERE symbol = ?";
  const args: (string | number)[] = [symbol];
  if (from !== undefined) { sql += " AND ts >= ?"; args.push(from); }
  if (to !== undefined) { sql += " AND ts <= ?"; args.push(to); }
  sql += " ORDER BY ts ASC";
  if (limit > 0) { sql += " LIMIT ?"; args.push(limit); }
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => ({
    ts: Number(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

// ─── Broker flow analytics cache ────────────────────────────────────────────
export async function getBrokerFlowCache(date: string, section: string): Promise<unknown | null> {
  const r = await db.execute({
    sql: "SELECT payload FROM broker_flow_cache WHERE date = ? AND section = ?",
    args: [date, section],
  });
  if (r.rows.length === 0) return null;
  try {
    return JSON.parse(String(r.rows[0].payload));
  } catch {
    return null;
  }
}

export async function saveBrokerFlowCache(date: string, section: string, data: unknown): Promise<void> {
  const payload = JSON.stringify(data);
  await db.execute({
    sql: `INSERT INTO broker_flow_cache(date, section, payload, savedAt)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(date, section) DO UPDATE SET payload=excluded.payload, savedAt=excluded.savedAt`,
    args: [date, section, payload, Date.now()],
  });
}

// ─── MeroLagani Broker Daily Data (REAL data saved at 3:30 PM) ─────────────
export type MeroBrokerDaily = {
  tradeDate: string;
  brokerCode: string;
  brokerName: string;
  purchaseAmt: number;
  sellAmt: number;
  netAmt: number;
  totalAmt: number;
};

// Save MeroLagani broker data for a specific date
export async function saveMeroLaganiBrokerDaily(date: string, brokers: MeroBrokerDaily[]): Promise<number> {
  if (!brokers.length || !date) return 0;
  const now = Date.now();
  // Upsert: insert or update if exists
  const statements = brokers.map((b) => ({
    sql: `INSERT INTO merolagani_broker_daily(tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tradeDate, brokerCode) DO UPDATE SET
            brokerName=excluded.brokerName,
            purchaseAmt=excluded.purchaseAmt,
            sellAmt=excluded.sellAmt,
            netAmt=excluded.netAmt,
            totalAmt=excluded.totalAmt,
            savedAt=excluded.savedAt`,
    args: [date, b.brokerCode, b.brokerName, b.purchaseAmt, b.sellAmt, b.netAmt, b.totalAmt, now],
  }));
  await db.batch(statements, "write");
  return brokers.length;
}

// Get MeroLagani broker data for a specific date
export async function getMeroLaganiBrokerDaily(date: string): Promise<MeroBrokerDaily[]> {
  const r = await db.execute({
    sql: `SELECT tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt
          FROM merolagani_broker_daily
          WHERE tradeDate = ?
          ORDER BY ABS(netAmt) DESC`,
    args: [date],
  });
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    brokerCode: String(row.brokerCode),
    brokerName: String(row.brokerName),
    purchaseAmt: Number(row.purchaseAmt),
    sellAmt: Number(row.sellAmt),
    netAmt: Number(row.netAmt),
    totalAmt: Number(row.totalAmt),
  }));
}

// Get latest available date for MeroLagani broker data
export async function getLatestMeroBrokerDate(): Promise<string | null> {
  const r = await db.execute("SELECT MAX(tradeDate) as d FROM merolagani_broker_daily");
  return r.rows[0]?.d ? String(r.rows[0].d) : null;
}

// Check if data exists for a date
export async function hasMeroBrokerData(date: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM merolagani_broker_daily WHERE tradeDate = ?",
    args: [date],
  });
  return Number(r.rows[0]?.cnt ?? 0) > 0;
}

// ─── Broker Daily Summary (unified cache-aside layer) ────────────────────

export type BrokerDailySummaryRow = {
  tradeDate: string;
  brokerCode: string;
  brokerName: string;
  buyAmt: number;
  sellAmt: number;
  netAmt: number;
  totalAmt: number;
  buyQty: number | null;
  sellQty: number | null;
  source: string;
};

export type BrokerHistoryRow = {
  date: string;
  source: string;
  buyQty: number | null;
  sellQty: number | null;
  netQty: number | null;
  buyAmt: number | null;
  sellAmt: number | null;
  netAmt: number | null;
};

export function computeHash(data: unknown): string {
  const s = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// Upsert MeroLagani broker daily summary (cache-aside write)
export async function upsertBrokerDailySummary(
  date: string,
  brokers: Array<{
    brokerCode: string;
    brokerName: string;
    purchaseAmt: number;
    sellAmt: number;
    netAmt: number;
    totalAmt: number;
  }>,
): Promise<number> {
  if (!brokers.length || !date) return 0;
  const now = Date.now();
  const dataHash = computeHash(brokers);
  const statements = brokers.map((b) => ({
    sql: `INSERT INTO merolagani_broker_daily(tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, savedAt, hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tradeDate, brokerCode) DO UPDATE SET
            brokerName=excluded.brokerName,
            purchaseAmt=excluded.purchaseAmt,
            sellAmt=excluded.sellAmt,
            netAmt=excluded.netAmt,
            totalAmt=excluded.totalAmt,
            savedAt=excluded.savedAt,
            hash=excluded.hash`,
    args: [date, b.brokerCode, b.brokerName, b.purchaseAmt, b.sellAmt, b.netAmt, b.totalAmt, now, dataHash],
  }));
  await db.batch(statements, "write");
  return brokers.length;
}

// Get all MeroLagani broker data for a specific date
export async function getBrokerDailySummary(date: string): Promise<BrokerDailySummaryRow[]> {
  const r = await db.execute({
    sql: `SELECT tradeDate, brokerCode, brokerName, purchaseAmt, sellAmt, netAmt, totalAmt, buyQty, sellQty, hash
          FROM merolagani_broker_daily
          WHERE tradeDate = ?
          ORDER BY ABS(netAmt) DESC`,
    args: [date],
  });
  return r.rows.map((row) => ({
    tradeDate: String(row.tradeDate),
    brokerCode: String(row.brokerCode),
    brokerName: String(row.brokerName || ""),
    buyAmt: Number(row.purchaseAmt),
    sellAmt: Number(row.sellAmt),
    netAmt: Number(row.netAmt),
    totalAmt: Number(row.totalAmt),
    buyQty: row.buyQty != null ? Number(row.buyQty) : null,
    sellQty: row.sellQty != null ? Number(row.sellQty) : null,
    source: "verified",
  }));
}

// Get hash for a date (to detect changes)
export async function getBrokerDailyHash(date: string): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT hash FROM merolagani_broker_daily WHERE tradeDate = ? LIMIT 1",
    args: [date],
  });
  return r.rows.length > 0 ? String(r.rows[0].hash ?? "") : null;
}

// Get broker data from floorsheet agg for a specific date + broker
export async function getFloorBrokerData(date: string, brokerCode: string): Promise<BrokerHistoryRow | null> {
  const r = await db.execute({
    sql: `SELECT SUM(buyQty) as buyQty, SUM(buyAmt) as buyAmt,
                 SUM(sellQty) as sellQty, SUM(sellAmt) as sellAmt,
                 SUM(netQty) as netQty, SUM(netAmt) as netAmt
          FROM broker_daily_agg
          WHERE tradeDate = ? AND brokerId = ?`,
    args: [date, brokerCode],
  });
  if (!r.rows.length || !r.rows[0].buyQty) return null;
  const row = r.rows[0];
  return {
    date,
    source: "floorsheet",
    buyQty: Number(row.buyQty),
    sellQty: Number(row.sellQty),
    netQty: Number(row.netQty),
    buyAmt: Number(row.buyAmt),
    sellAmt: Number(row.sellAmt),
    netAmt: Number(row.netAmt),
  };
}

// Get broker data from MeroLagani cache for a specific date + broker
export async function getMeroBrokerData(date: string, brokerCode: string): Promise<BrokerHistoryRow | null> {
  const r = await db.execute({
    sql: `SELECT purchaseAmt, sellAmt, netAmt, totalAmt
          FROM merolagani_broker_daily
          WHERE tradeDate = ? AND brokerCode = ?`,
    args: [date, brokerCode],
  });
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return {
    date,
    source: "verified",
    buyQty: null,
    sellQty: null,
    netQty: null,
    buyAmt: Number(row.purchaseAmt),
    sellAmt: Number(row.sellAmt),
    netAmt: Number(row.netAmt),
  };
}

// ─── Sync logs ─────────────────────────────────────────────────────────
export type SyncLogRow = {
  id: number;
  ts: number;
  attempt: number;
  phase: string;
  status: string;
  detail: string;
  broker_date: string | null;
  broker_count: number;
  broker_action: string | null;
  floorsheet_date: string | null;
  floorsheet_trades: number;
  floorsheet_action: string | null;
  duration_ms: number;
  error: string | null;
};

export async function saveSyncLog(row: {
  attempt: number;
  phase: string;
  status: string;
  detail: string;
  broker_date?: string | null;
  broker_count?: number;
  broker_action?: string | null;
  floorsheet_date?: string | null;
  floorsheet_trades?: number;
  floorsheet_action?: string | null;
  duration_ms?: number;
  error?: string | null;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO sync_logs(ts, attempt, phase, status, detail, broker_date, broker_count, broker_action, floorsheet_date, floorsheet_trades, floorsheet_action, duration_ms, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      Date.now(),
      row.attempt,
      row.phase,
      row.status,
      row.detail,
      row.broker_date ?? null,
      row.broker_count ?? 0,
      row.broker_action ?? null,
      row.floorsheet_date ?? null,
      row.floorsheet_trades ?? 0,
      row.floorsheet_action ?? null,
      row.duration_ms ?? 0,
      row.error ?? null,
    ],
  });
}

export async function getSyncLogs(limit = 50): Promise<SyncLogRow[]> {
  const r = await db.execute({
    sql: `SELECT id, ts, attempt, phase, status, detail, broker_date, broker_count, broker_action, floorsheet_date, floorsheet_trades, floorsheet_action, duration_ms, error
          FROM sync_logs ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    ts: Number(row.ts),
    attempt: Number(row.attempt),
    phase: String(row.phase),
    status: String(row.status),
    detail: String(row.detail),
    broker_date: row.broker_date != null ? String(row.broker_date) : null,
    broker_count: Number(row.broker_count),
    broker_action: row.broker_action != null ? String(row.broker_action) : null,
    floorsheet_date: row.floorsheet_date != null ? String(row.floorsheet_date) : null,
    floorsheet_trades: Number(row.floorsheet_trades),
    floorsheet_action: row.floorsheet_action != null ? String(row.floorsheet_action) : null,
    duration_ms: Number(row.duration_ms),
    error: row.error != null ? String(row.error) : null,
  }));
}

// ─── Error logs ────────────────────────────────────────────────────────
export type ErrorLogRow = {
  id: number;
  ts: number;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  context: string | null;
};

export async function saveErrorLog(row: {
  source: string;
  severity?: string;
  message: string;
  stack?: string | null;
  context?: string | null;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO error_logs(ts, source, severity, message, stack, context) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      Date.now(),
      row.source,
      row.severity ?? "error",
      row.message,
      row.stack ?? null,
      row.context ?? null,
    ],
  });
}

export async function getErrorLogs(limit = 50): Promise<ErrorLogRow[]> {
  const r = await db.execute({
    sql: `SELECT id, ts, source, severity, message, stack, context FROM error_logs ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    ts: Number(row.ts),
    source: String(row.source),
    severity: String(row.severity),
    message: String(row.message),
    stack: row.stack != null ? String(row.stack) : null,
    context: row.context != null ? String(row.context) : null,
  }));
}

// ─── Pipeline Run Log ────────────────────────────────────────────────────

export async function getPipelineRunStatus(runDate: string): Promise<string | null> {
  try {
    const r = await db.execute({
      sql: `SELECT status FROM pipeline_run_log WHERE run_date = ?`,
      args: [runDate],
    });
    if (r.rows.length > 0) return String(r.rows[0].status);
  } catch { /* table may not exist yet */ }
  return null;
}

export async function markPipelineRunStart(runDate: string, pipeline = "broker_ingest"): Promise<void> {
  await db.execute({
    sql: `INSERT INTO pipeline_run_log(run_date, pipeline, status, rows_written, started_at)
          VALUES (?, ?, 'running', 0, ?)
          ON CONFLICT(run_date) DO UPDATE SET status='running', started_at=excluded.started_at`,
    args: [runDate, pipeline, Date.now()],
  });
}

export async function markPipelineRunComplete(
  runDate: string, status: "success" | "partial" | "failed", rowsWritten: number,
  pipeline = "broker_ingest",
): Promise<void> {
  await db.execute({
    sql: `UPDATE pipeline_run_log SET status = ?, rows_written = ?, completed_at = ? WHERE run_date = ? AND pipeline = ?`,
    args: [status, rowsWritten, Date.now(), runDate, pipeline],
  });
}
