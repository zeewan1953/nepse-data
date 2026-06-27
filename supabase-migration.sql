-- Supabase Database Migration for NEPSE AXION
-- Run this in your Supabase SQL Editor: https://tnbdujuoofevbqognyzc.supabase.co/project/default/editor/sql

-- Essential tables for market data (Vercel-compatible)

-- 1. Live OHLC data for real-time market prices
CREATE TABLE IF NOT EXISTS live_ohlc (
  symbol TEXT PRIMARY KEY,
  ltp REAL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume BIGINT,
  turnover REAL,
  change_percent REAL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Stock master data
CREATE TABLE IF NOT EXISTS stocks (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  listed_shares BIGINT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Floorsheet trades
CREATE TABLE IF NOT EXISTS floorsheet_trades (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  buyer BIGINT,
  seller BIGINT,
  quantity BIGINT,
  rate REAL,
  turnover REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_floorsheet_symbol ON floorsheet_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_floorsheet_date ON floorsheet_trades(trade_date);

-- 4. Daily OHLCV aggregation
CREATE TABLE IF NOT EXISTS stock_daily_ohlcv (
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume BIGINT,
  turnover REAL,
  transactions BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (symbol, trade_date)
);

-- 5. Broker daily aggregation
CREATE TABLE IF NOT EXISTS broker_daily_agg (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  broker_id BIGINT NOT NULL,
  buy_qty BIGINT DEFAULT 0,
  sell_qty BIGINT DEFAULT 0,
  buy_amount REAL DEFAULT 0,
  sell_amount REAL DEFAULT 0,
  net_qty BIGINT DEFAULT 0,
  net_amount REAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_agg_symbol ON broker_daily_agg(symbol);
CREATE INDEX IF NOT EXISTS idx_broker_agg_date ON broker_daily_agg(trade_date);
CREATE INDEX IF NOT EXISTS idx_broker_agg_broker ON broker_daily_agg(broker_id);

-- 6. Broker flow cache (for computed analytics)
CREATE TABLE IF NOT EXISTS broker_flow_cache (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  momentum_score REAL,
  smart_money_score REAL,
  volume_z_score REAL,
  cmf REAL,
  mfi REAL,
  order_flow TEXT,
  net_broker_flow REAL,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(symbol, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_broker_flow_symbol ON broker_flow_cache(symbol);

-- 7. Sync logs (for tracking data syncs)
CREATE TABLE IF NOT EXISTS sync_logs (
  id BIGSERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security (RLS) - optional, for security
-- ALTER TABLE live_ohlc ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE floorsheet_trades ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_daily_ohlcv ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE broker_daily_agg ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE broker_flow_cache ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
