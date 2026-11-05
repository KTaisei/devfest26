import os
from functools import lru_cache
from urllib.parse import urlsplit
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    demo_mode: bool = True
    storage_backend: str = "memory"
    firebase_project_id: str = ""
    firebase_emulator_mode: bool = False
    firebase_auth_emulator_host: str = ""
    firestore_emulator_host: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @model_validator(mode="after")
    def validate_emulators(self):
        hosts = (self.firebase_auth_emulator_host, self.firestore_emulator_host)
        if not self.firebase_emulator_mode:
            if any(hosts):
                raise ValueError("Emulator hosts require explicit FIREBASE_EMULATOR_MODE=true")
            return self
        if os.environ.get("K_SERVICE"):
            raise ValueError("Firebase emulators must not be enabled on Cloud Run")
        if not self.firebase_project_id.startswith("demo-") or self.storage_backend != "firestore":
            raise ValueError("Emulators require a demo- project ID and Firestore storage")
        for host in hosts:
            parsed = urlsplit("//" + host)
            if (
                parsed.hostname not in {"127.0.0.1", "localhost"}
                or not parsed.port
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
            ):
                raise ValueError("Both emulator hosts must be loopback host:port without a scheme")
        return self


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
