from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    demo_mode: bool = True
    storage_backend: str = "memory"
    firebase_project_id: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def settings() -> Settings:
    config = Settings()
    if config.storage_backend not in {"memory", "firestore"}:
        raise ValueError("Unsupported storage backend")
    if not config.demo_mode and (
        config.storage_backend != "firestore" or not config.firebase_project_id
    ):
        raise ValueError("Firebase auth and Firestore are required outside local demo mode")
    return config
