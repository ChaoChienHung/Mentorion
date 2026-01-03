import os

class Settings:
    API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

settings = Settings()
