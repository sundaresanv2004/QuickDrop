from dataclasses import dataclass, field
from typing import Any

@dataclass
class DeviceInfo:
    device_id: str
    device_name: str
    ip: str
    websocket: Any   # fastapi.WebSocket — typed as Any to avoid circular imports
    device_type: str = "unknown"
    connected_at: float = 0.0
    is_busy: bool = False
