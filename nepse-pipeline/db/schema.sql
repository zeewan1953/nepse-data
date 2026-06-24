-- Equivalent of db/models.py, if you'd rather run this directly in psql.

CREATE TABLE IF NOT EXISTS floorsheet_trades (
    id              SERIAL PRIMARY KEY,
    trade_date      DATE NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    buyer_broker    VARCHAR(10) NOT NULL,
    seller_broker   VARCHAR(10) NOT NULL,
    quantity        INTEGER NOT NULL,
    rate            DOUBLE PRECISION NOT NULL,
    amount          DOUBLE PRECISION NOT NULL,
    contract_no     VARCHAR(50),
    trade_time      VARCHAR(10),
    status          VARCHAR(20) DEFAULT 'clean',
    flag_reason     TEXT,
    ai_verdict      VARCHAR(30),
    ai_explanation  TEXT,
    scraped_at      TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_trade_date_contract UNIQUE (trade_date, contract_no)
);

CREATE INDEX IF NOT EXISTS ix_symbol_date ON floorsheet_trades (symbol, trade_date);
CREATE INDEX IF NOT EXISTS ix_buyer_broker_date ON floorsheet_trades (buyer_broker, trade_date);
CREATE INDEX IF NOT EXISTS ix_seller_broker_date ON floorsheet_trades (seller_broker, trade_date);

CREATE TABLE IF NOT EXISTS scrape_log (
    trade_date          DATE PRIMARY KEY,
    row_hash             VARCHAR(64) NOT NULL,
    data_version          INTEGER DEFAULT 1,
    row_count             INTEGER DEFAULT 0,
    flagged_count          INTEGER DEFAULT 0,
    first_scraped_at        TIMESTAMP DEFAULT NOW(),
    last_checked_at         TIMESTAMP DEFAULT NOW(),
    last_changed_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_cache (
    id           SERIAL PRIMARY KEY,
    query_key     VARCHAR(200) UNIQUE NOT NULL,
    resolved       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),
    resolved_at      TIMESTAMP
);
