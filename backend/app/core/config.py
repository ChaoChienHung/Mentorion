import os
from typing import Optional

class Settings:
    """
    Configuration settings for the application.
    """
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    LOGGER_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
    LOG_TARGET: str = os.getenv("MENTORION_LOG_TARGET", "file")
    DATABASE: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "mentorion-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

settings = Settings()
