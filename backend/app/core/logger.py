import os
import logging
from typing import Optional
from .config import settings

os.makedirs(settings.LOGGER_FOLDER, exist_ok=True)

_formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")


def _ensure_handler(
    logger: logging.Logger, handler_type: type, *, file_path: Optional[str] = None
) -> None:
    for h in logger.handlers:
        if not isinstance(h, handler_type):
            continue
        if file_path is not None and getattr(h, "baseFilename", None) != file_path:
            continue
        return

    if handler_type is logging.FileHandler:
        handler = logging.FileHandler(file_path)
    else:
        handler = logging.StreamHandler()

    handler.setFormatter(_formatter)
    logger.addHandler(handler)


def _get_logger(name: str, level: int, file_name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False

    log_target = (settings.LOG_TARGET or "").lower()
    file_path = os.path.join(settings.LOGGER_FOLDER, file_name)

    if log_target in {"console", "stdout"}:
        _ensure_handler(logger, logging.StreamHandler)
        return logger

    if log_target in {"both", "console+file", "file+console"}:
        _ensure_handler(logger, logging.StreamHandler)
        _ensure_handler(logger, logging.FileHandler, file_path=file_path)
        return logger

    _ensure_handler(logger, logging.FileHandler, file_path=file_path)

    return logger


msg_logger = _get_logger("MessageLogger", logging.DEBUG, "MessageLogger.log")
error_logger = _get_logger("ErrorLogger", logging.WARNING, "ErrorLogger.log")
