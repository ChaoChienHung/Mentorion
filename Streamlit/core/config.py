import os

class Settings:
    """
    Configuration settings for the application.
    """
    NOTE_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "notes")
    LOGGER_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")

settings = Settings()
