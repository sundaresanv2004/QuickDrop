import uuid

from fastapi import WebSocket

from app.models import DeviceInfo, DeviceListMessage


class ConnectionManager:
    """Manages active WebSocket connections and device state."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._devices: dict[str, DeviceInfo] = {}

    async def register(self, websocket: WebSocket, name: str) -> str:
        """Register a new device connection and return the assigned id."""
        device_id = uuid.uuid4().hex[:8]
        self._connections[device_id] = websocket
        self._devices[device_id] = DeviceInfo(id=device_id, name=name)
        return device_id

    def update_name(self, device_id: str, new_name: str) -> None:
        """Update the name of an existing device."""
        if device_id in self._devices:
            self._devices[device_id].name = new_name

    def disconnect(self, device_id: str) -> None:
        """Remove a device from the active connections."""
        self._connections.pop(device_id, None)
        self._devices.pop(device_id, None)

    def get_device_list(self) -> list[DeviceInfo]:
        """Return the current list of connected devices."""
        return list(self._devices.values())

    async def broadcast_device_list(self) -> None:
        """Send the current device list to all connected clients."""
        message = DeviceListMessage(
            type="device-list",
            devices=self.get_device_list(),
        )
        payload = message.model_dump_json()

        dead: list[str] = []
        for device_id, ws in self._connections.items():
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(device_id)

        for device_id in dead:
            self.disconnect(device_id)
