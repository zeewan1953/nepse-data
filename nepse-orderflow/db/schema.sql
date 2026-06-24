-- NEPSE Order Flow Database Schema

-- Drop existing tables
DROP TABLE IF EXISTS market_depth CASCADE;
DROP TABLE IF EXISTS order_flow CASCADE;
DROP TABLE IF EXISTS symbols CASCADE;
DROP TABLE IF EXISTS change_log CASCADE;

-- Symbols table
CREATE TABLE symbols (
    symbol VARCHAR(20) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market depth table
CREATE TABLE market_depth (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL REFERENCES symbols(symbol) ON DELETE CASCADE,
    snapshot_time TIMESTAMP NOT NULL,
    bids JSONB NOT NULL,
    asks JSONB NOT NULL,
    total_bid_qty BIGINT GENERATED ALWAYS AS (
        SELECT COALESCE(SUM((bid->>'qty')::BIGINT), 0) FROM jsonb_array_elements(bids) AS bid
    ) STORED,
    total_ask_qty BIGINT GENERATED ALWAYS AS (
        SELECT COALESCE(SUM((ask->>'qty')::BIGINT), 0) FROM jsonb_array_elements(asks) AS ask
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order flow table (NEW!)
CREATE TABLE order_flow (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL REFERENCES symbols(symbol) ON DELETE CASCADE,
    buy_pressure DECIMAL(5,4) NOT NULL,
    sell_pressure DECIMAL(5,4) NOT NULL,
    imbalance DECIMAL(5,4) NOT NULL,
    trend VARCHAR(20) NOT NULL,
    signal VARCHAR(10) NOT NULL,
    large_orders JSONB,
    liquidity_walls JSONB,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Change log table
CREATE TABLE change_log (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL REFERENCES symbols(symbol) ON DELETE CASCADE,
    old_data JSONB,
    new_data JSONB NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_market_depth_symbol_time ON market_depth(symbol, snapshot_time DESC);
CREATE INDEX idx_order_flow_symbol_time ON order_flow(symbol, timestamp DESC);
CREATE INDEX idx_order_flow_trend ON order_flow(trend);
CREATE INDEX idx_order_flow_signal ON order_flow(signal);
CREATE INDEX idx_change_log_symbol_time ON change_log(symbol, changed_at DESC);
CREATE INDEX idx_symbols_active ON symbols(is_active);

-- Views for latest data
CREATE OR REPLACE VIEW latest_market_depth AS
SELECT DISTINCT ON (symbol)
    symbol, snapshot_time, bids, asks, total_bid_qty, total_ask_qty
FROM market_depth
ORDER BY symbol, snapshot_time DESC;

CREATE OR REPLACE VIEW latest_order_flow AS
SELECT DISTINCT ON (symbol)
    symbol, buy_pressure, sell_pressure, imbalance, trend, signal, timestamp
FROM order_flow
ORDER BY symbol, timestamp DESC;

-- Function to log changes
CREATE OR REPLACE FUNCTION log_market_depth_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO change_log (symbol, old_data, new_data)
    VALUES (
        NEW.symbol,
        (SELECT row_to_json(m) FROM (SELECT bids, asks FROM market_depth WHERE id = NEW.id - 1) m),
        row_to_json(NEW)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for change logging
CREATE TRIGGER trg_market_depth_change
AFTER INSERT ON market_depth
FOR EACH ROW
EXECUTE FUNCTION log_market_depth_change();

-- Insert sample symbols
INSERT INTO symbols (symbol, company_name) VALUES
    ('NABIL', 'Nepal Bank Limited'),
    ('NICA', 'Nepal Investment Capital'),
    ('SCB', 'Standard Chartered Bank Nepal'),
    ('HBL', 'Himalayan Bank Limited'),
    ('GBL', 'Global IME Bank Limited'),
    ('PRVU', 'Prime Commercial Bank'),
    ('NBL', 'Nepal Bank Limited'),
    ('API', 'API Power Company'),
    ('SHL', 'Shikhar Insurance'),
    ('NLG', 'Nepal Life Insurance'),
    ('LIC', 'Life Insurance Corporation'),
    ('NIC', 'Nepal Insurance Company'),
    ('CTG', 'Chhimek Laghubitta'),
    ('DDB', 'Deprosc Laghubitta'),
    ('JFL', 'Jyoti Bikas Bank'),
    ('KBL', 'Kumari Bank Limited'),
    ('NBB', 'Nepal Bangladesh Bank'),
    ('SBL', 'Siddhartha Bank Limited'),
    ('SAN', 'Sanima Bank Limited'),
    ('NMF', 'Nepal Microfinance')
ON CONFLICT (symbol) DO NOTHING;
