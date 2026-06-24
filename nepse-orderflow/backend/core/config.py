from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://orderflow:orderflow123@localhost:5432/orderflow_db"
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_CACHE_TTL: int = 300
    API_TITLE: str = "NEPSE Order Flow API"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = False
    CORS_ORIGINS: list = ["*"]

    class Config:
        env_file = ".env"

settings = Settings()
