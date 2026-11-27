import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[3]

# Load .env.local first (higher priority than .env, lower than real shell env vars)
load_dotenv(_REPO_ROOT / ".env.local", override=False)
load_dotenv(_REPO_ROOT / ".env", override=False)


def _resolve_vault_dir() -> str:
    raw = (os.getenv("MENTORION_VAULT_DIR") or os.getenv("MENTORION_DATA_DIR") or "").strip()
    if raw:
        expanded = Path(os.path.expanduser(raw))
        if not expanded.is_absolute():
            expanded = (_REPO_ROOT / expanded).resolve()
        return str(expanded)
    return str((_REPO_ROOT / "data").resolve())


class Settings:
    """
    Configuration settings for the application.
    All user data (app.db, questions.json, library/) lives inside VAULT_DIR,
    which defaults to `<repo>/data` and can be overridden by MENTORION_VAULT_DIR
    (e.g. pointing to a separate private `../Mentorion-Vault` repository).
    """
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "auto")
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_BASE_URL: Optional[str] = os.getenv("OPENAI_BASE_URL")
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    HOST: str = os.getenv("MENTORION_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("MENTORION_PORT") or os.getenv("PORT") or "8000")
    LOGGER_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
    LOG_TARGET: str = os.getenv("MENTORION_LOG_TARGET", "file")
    VAULT_DIR: str = _resolve_vault_dir()
    DATABASE: str = VAULT_DIR
    LIBRARY_DIR: str = os.path.join(VAULT_DIR, "library")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "mentorion-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30


settings = Settings()
