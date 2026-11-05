import logging
import sys

logger = logging.getLogger("user-service")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("[user-service] %(levelname)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
