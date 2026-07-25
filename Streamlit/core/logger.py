import os
import logging
from core.config import settings

os.makedirs(settings.LOGGER_FOLDER, exist_ok=True)

_formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")


def _get_file_logger(name: str, level: int, file_name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False

    file_path = os.path.join(settings.LOGGER_FOLDER, file_name)
    if not any(
        isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", None) == file_path
        for h in logger.handlers
    ):
        handler = logging.FileHandler(file_path)
        handler.setFormatter(_formatter)
        logger.addHandler(handler)

    return logger


msg_logger = _get_file_logger("MessageLogger", logging.DEBUG, "MessageLogger.log")
error_logger = _get_file_logger("ErrorLogger", logging.WARNING, "ErrorLogger.log")
