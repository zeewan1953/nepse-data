import os
from typing import List

class CollectorConfig:
    """Collector configuration"""
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://nepse:nepse123@localhost:5432/nepse_depth")
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Collection settings
    COLLECTION_INTERVAL: int = int(os.getenv("COLLECTION_INTERVAL", "60"))  # seconds
    
    # Session
    SESSION_DIR: str = os.getenv("SESSION_DIR", "/app/session")
    AUTH_FILE: str = os.path.join(SESSION_DIR, "auth.json")
    
    # Market hours (Nepal Time - UTC+5:45)
    MARKET_HOURS_START: str = "11:00"
    MARKET_HOURS_END: str = "15:00"
    TIMEZONE: str = "Asia/Kathmandu"
    
    # Symbols to track
    DEFAULT_SYMBOLS: List[str] = [
        "NABIL", "NICA", "SCB", "HBL", "GBL",
        "PRVU", "NBL", "API", "SHL", "NLG",
        "LIC", "NIC", "CTG", "DDB", "JFL",
        "KBL", "NBB", "SBL", "SAN", "NMF"
    ]
    
    # Browser settings
    HEADLESS: bool = os.getenv("HEADLESS", "true").lower() == "true"
    SLOW_MO: int = int(os.getenv("SLOW_MO", "0"))

config = CollectorConfig()
"""
Collector Configuration
"""

from pydantic_settings import BaseSettings
from typing import Optional


class CollectorSettings(BaseSettings):
    """Collector settings"""
    
    # Database
    DATABASE_URL: str = "postgresql://nepse_user:nepse_secure_password_2026@localhost:5432/nepse_market_depth"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # FastAPI Backend
    FASTAPI_URL: str = "http://localhost:8000"
    
    # Market Hours (Nepal Time)
    MARKET_HOURS_START: str = "11:00"
    MARKET_HOURS_END: str = "15:00"
    TIMEZONE: str = "Asia/Kathmandu"
    
    # Collector Settings
    SNAPSHOT_INTERVAL: int = 60  # seconds
    SESSION_TIMEOUT: int = 300  # seconds
    RECONNECT_DELAY: int = 30  # seconds
    
    # Trading Platform URL
    TRADING_PLATFORM_URL: str = "https://tms.nepalstock.com"
    
    # Session Storage
    SESSION_DIR: str = "/app/sessions"
    AUTH_DIR: str = "/app/auth"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = CollectorSettings()
