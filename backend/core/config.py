import os

class Settings:
    """
    Configuration settings for the application.
    """
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    LOGGER_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")

settings = Settings()
