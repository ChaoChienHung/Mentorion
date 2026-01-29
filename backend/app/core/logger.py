import os
import logging
from core.config import settings

# ------------------------------
# Ensure Logger Directory Exists
# ------------------------------

os.makedirs(settings.LOGGER_FOLDER, exist_ok=True)

# -----------------------
# General Messages Logger
# -----------------------
msg_logger = logging.getLogger("MessageLogger")
msg_logger.setLevel(logging.DEBUG)
file_handler1 = logging.FileHandler(settings.LOGGER_FOLDER + "/MessageLogger.log")
formatter1 = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler1.setFormatter(formatter1)
msg_logger.addHandler(file_handler1)


# ----------------------
# Critical Errors Logger
# ----------------------
error_logger = logging.getLogger("ErrorLogger")
error_logger.setLevel(logging.WARNING)
file_handler2 = logging.FileHandler(settings.LOGGER_FOLDER + "/ErrorLogger.log")
formatter2 = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler2.setFormatter(formatter2)
error_logger.addHandler(file_handler2)