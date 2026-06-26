-- Initialize broker data tables for Broker Analysis dashboard
-- Run once to set up schema

-- Main broker daily data table
CREATE TABLE IF NOT EXISTS merolagani_broker_daily (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    broker_code VARCHAR(10) NOT NULL,
    broker_name VARCHAR(255),
    purchase_amt DOUBLE PRECISION,
    sell_amt DOUBLE PRECISION,
    net_amt DOUBLE PRECISION,
    total_amt DOUBLE PRECISION,
    scraped_at TIMESTAMP DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'merolagani',

    -- Ensure no duplicates per date/broker/source
    UNIQUE (trade_date, broker_code, source),

    -- Data integrity checks
    CONSTRAINT positive_amounts CHECK (
        purchase_amt IS NULL OR purchase_amt >= 0
    ),
    CONSTRAINT valid_dates CHECK (
        trade_date >= '2020-01-01' AND trade_date <= CURRENT_DATE
    )
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS ix_broker_code_date
    ON merolagani_broker_daily (broker_code, trade_date DESC);

CREATE INDEX IF NOT EXISTS ix_trade_date
    ON merolagani_broker_daily (trade_date DESC);

CREATE INDEX IF NOT EXISTS ix_source
    ON merolagani_broker_daily (source);

-- Audit table to track data collection runs
CREATE TABLE IF NOT EXISTS broker_scrape_log (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    source VARCHAR(50),
    record_count INTEGER,
    error_count INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(20),  -- 'pending', 'success', 'partial', 'failed'
    error_message TEXT,

    UNIQUE (trade_date, source)
);

CREATE INDEX IF NOT EXISTS ix_scrape_log_date
    ON broker_scrape_log (trade_date DESC);

-- Validation metrics table
CREATE TABLE IF NOT EXISTS broker_data_metrics (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    total_brokers INTEGER,
    total_buy_amount DOUBLE PRECISION,
    total_sell_amount DOUBLE PRECISION,
    avg_net_per_broker DOUBLE PRECISION,
    data_quality_score FLOAT,  -- 0-100, based on completeness
    calculated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (trade_date)
);

-- Streaks view: compute buy/sell streaks per broker
CREATE OR REPLACE VIEW broker_streaks AS
SELECT
    broker_code,
    broker_name,
    trade_date,
    CASE
        WHEN net_amt > 0 THEN 'buy'
        WHEN net_amt < 0 THEN 'sell'
        ELSE 'neutral'
    END AS direction,
    LAG(CASE
        WHEN net_amt > 0 THEN 'buy'
        WHEN net_amt < 0 THEN 'sell'
        ELSE 'neutral'
    END) OVER (PARTITION BY broker_code ORDER BY trade_date) AS prev_direction
FROM merolagani_broker_daily
WHERE source = 'merolagani'
ORDER BY broker_code, trade_date;

-- Summary view: daily broker statistics
CREATE OR REPLACE VIEW broker_daily_summary AS
SELECT
    trade_date,
    COUNT(DISTINCT broker_code) as active_brokers,
    SUM(purchase_amt) as market_buy_amt,
    SUM(sell_amt) as market_sell_amt,
    SUM(net_amt) as market_net_amt,
    SUM(total_amt) as market_turnover,
    MAX(total_amt) as max_broker_turnover,
    MIN(total_amt) as min_broker_turnover,
    AVG(total_amt) as avg_broker_turnover
FROM merolagani_broker_daily
WHERE source = 'merolagani'
GROUP BY trade_date
ORDER BY trade_date DESC;

-- Index for summary view
CREATE INDEX IF NOT EXISTS ix_broker_daily_summary_date
    ON merolagani_broker_daily (trade_date, broker_code)
    WHERE source = 'merolagani';

-- Stored procedure: calculate data quality score
CREATE OR REPLACE FUNCTION calculate_data_quality(in_trade_date DATE)
RETURNS FLOAT AS $$
DECLARE
    total_records INTEGER;
    complete_records INTEGER;
    expected_brokers INTEGER := 91;  -- Approximate number of active brokers
    quality_score FLOAT;
BEGIN
    -- Count total broker records for the date
    SELECT COUNT(*) INTO total_records
    FROM merolagani_broker_daily
    WHERE trade_date = in_trade_date
      AND source = 'merolagani';

    -- Count records with all required fields populated
    SELECT COUNT(*) INTO complete_records
    FROM merolagani_broker_daily
    WHERE trade_date = in_trade_date
      AND source = 'merolagani'
      AND purchase_amt IS NOT NULL
      AND sell_amt IS NOT NULL
      AND net_amt IS NOT NULL
      AND total_amt IS NOT NULL;

    -- Calculate quality as percentage of expected brokers with data
    IF total_records = 0 THEN
        quality_score := 0.0;
    ELSE
        quality_score := (complete_records::FLOAT / NULLIF(expected_brokers, 0)) * 100;
        quality_score := LEAST(quality_score, 100.0);
    END IF;

    RETURN quality_score;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: detect broker streaks
CREATE OR REPLACE FUNCTION detect_broker_streak(in_broker_code VARCHAR, in_days INTEGER DEFAULT 7)
RETURNS TABLE(
    direction VARCHAR,
    length INTEGER,
    start_date DATE,
    end_date DATE
) AS $$
WITH daily_direction AS (
    SELECT
        trade_date,
        CASE
            WHEN net_amt > 0 THEN 'buy'
            WHEN net_amt < 0 THEN 'sell'
            ELSE 'neutral'
        END AS direction,
        ROW_NUMBER() OVER (ORDER BY trade_date DESC) as rn
    FROM merolagani_broker_daily
    WHERE broker_code = in_broker_code
      AND source = 'merolagani'
      AND trade_date >= (CURRENT_DATE - INTERVAL '1 day' * in_days)
    ORDER BY trade_date DESC
),
streaks AS (
    SELECT
        direction,
        COUNT(*) as streak_length,
        MIN(trade_date) as start_dt,
        MAX(trade_date) as end_dt
    FROM daily_direction
    WHERE rn <= in_days
      AND direction != 'neutral'
    GROUP BY direction
    ORDER BY streak_length DESC
    LIMIT 1
)
SELECT
    direction,
    streak_length,
    start_dt,
    end_dt
FROM streaks;
$$ LANGUAGE SQL;

-- Data validation query (run periodically)
-- SELECT * FROM broker_daily_summary ORDER BY trade_date DESC LIMIT 7;

-- Sample queries for testing

-- Check latest day's data
-- SELECT trade_date, COUNT(*) as broker_count, SUM(total_amt) as total_turnover
-- FROM merolagani_broker_daily
-- WHERE source = 'merolagani'
-- GROUP BY trade_date
-- ORDER BY trade_date DESC
-- LIMIT 1;

-- Top 10 brokers by recent activity
-- SELECT broker_code, broker_name, SUM(total_amt) as turnover
-- FROM merolagani_broker_daily
-- WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days'
--   AND source = 'merolagani'
-- GROUP BY broker_code, broker_name
-- ORDER BY turnover DESC
-- LIMIT 10;

-- Detect current streaks for all brokers
-- SELECT broker_code, direction, length, end_date
-- FROM detect_broker_streak('52', 30)
-- WHERE length >= 2;
