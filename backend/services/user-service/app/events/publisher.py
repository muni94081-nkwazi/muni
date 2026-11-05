import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from aiokafka import AIOKafkaProducer

from app.core.config import settings
from app.core.logger import logger

TOPICS = {
    "USER_REGISTERED": "user.registered",
    "USER_PASSWORD_RESET_REQUESTED": "user.password_reset_requested",
    "USER_PASSWORD_RESET": "user.password_reset",
    "USER_PROFILE_UPDATED": "user.profile_updated",
    "USER_ADDRESS_CHANGED": "user.address_changed",
    "SELLER_STANDING_CHANGED": "seller.standing_changed",
}

_producer: Optional[AIOKafkaProducer] = None
_is_connected: bool = False


async def connect_producer() -> None:
    global _producer, _is_connected
    if _is_connected:
        return
    try:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_brokers_list,
            client_id=settings.KAFKA_CLIENT_ID,
        )
        await _producer.start()
        _is_connected = True
        logger.info("kafka producer connected")
    except Exception as e:
        logger.error(f"Kafka producer unavailable — continuing without event publishing: {e}")
        _is_connected = False


async def disconnect_producer() -> None:
    global _producer, _is_connected
    if not _is_connected or _producer is None:
        return
    try:
        await _producer.stop()
    except Exception as e:
        logger.error(f"Error disconnecting Kafka producer: {e}")
    finally:
        _is_connected = False
        _producer = None


def is_producer_ready() -> bool:
    return _is_connected


async def publish(topic: str, payload: Dict[str, Any]) -> None:
    if not _is_connected or _producer is None:
        logger.info(f"Kafka producer offline. Skipping event on topic '{topic}'")
        return

    try:
        now = datetime.now(timezone.utc)
        emitted_at = now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        data = {**payload, "emittedAt": emitted_at}
        user_id = str(payload.get("userId", ""))
        key = user_id.encode("utf-8") if user_id else None
        value = json.dumps(data).encode("utf-8")
        await _producer.send_and_wait(topic, key=key, value=value)
    except Exception as e:
        logger.error(f"Failed to publish event on topic '{topic}': {e}")
