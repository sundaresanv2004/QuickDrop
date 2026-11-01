from dataclasses import dataclass, field
from typing import Any

@dataclass
class DeviceInfo:
    device_id: str
    device_name: str
    ip: str
    websocket: Any   # fastapi.WebSocket, or None while waiting to reconnect
    device_type: str = "unknown"
    connected_at: float = 0.0
    is_busy: bool = False
    session_secret: str = ""
    pending_messages: list[dict] = field(default_factory=list)
