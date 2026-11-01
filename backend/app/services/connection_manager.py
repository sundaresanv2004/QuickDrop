from fastapi import WebSocket
from app.models.device import DeviceInfo
import secrets
import time

MAX_PENDING_MESSAGES = 64

class ConnectionManager:
    def __init__(self):
        self.devices: dict[str, DeviceInfo] = {}    # device_id → DeviceInfo
        self.rooms: dict[str, set[str]] = {}        # room_id → set of device_ids
        self.device_rooms: dict[str, str] = {}      # device_id → room_id

    async def connect(self, websocket: WebSocket, device_id: str, device_name: str, ip: str, room_id: str, device_type: str = "unknown", session_secret: str = ""):
        self.devices[device_id] = DeviceInfo(
            device_id=device_id,
            device_name=device_name,
            ip=ip,
            websocket=websocket,
            device_type=device_type,
            connected_at=time.time(),
            session_secret=session_secret
        )
        self._join_room(device_id, room_id)

    def _join_room(self, device_id: str, room_id: str):
        self.device_rooms[device_id] = room_id
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(device_id)

    def _leave_room(self, device_id: str):
        room_id = self.device_rooms.pop(device_id, None)
        if room_id and room_id in self.rooms:
            self.rooms[room_id].discard(device_id)
            if not self.rooms[room_id]:
                self.rooms.pop(room_id, None)

    def disconnect(self, device_id: str):
        if device_id not in self.devices:
            return

        self._leave_room(device_id)
        self.devices.pop(device_id, None)

    def can_resume(self, device_id: str | None, session_secret: str | None) -> bool:
        device = self.devices.get(device_id) if device_id else None
        if not device or not session_secret:
            return False
        return secrets.compare_digest(device.session_secret, session_secret)

    def resume(self, device_id: str, websocket: WebSocket, ip: str, room_id: str) -> tuple[WebSocket | None, str | None]:
        """Moves a device to a new socket. Returns its previous socket and room."""
        device = self.devices[device_id]
        previous_socket = device.websocket
        previous_room = self.device_rooms.get(device_id)

        device.websocket = websocket
        device.ip = ip
        if previous_room != room_id:
            self._leave_room(device_id)
            self._join_room(device_id, room_id)
        return previous_socket, previous_room

    def mark_disconnected(self, device_id: str, websocket: WebSocket) -> bool:
        """Returns False if the device has already moved to a newer socket."""
        device = self.devices.get(device_id)
        if not device or device.websocket is not websocket:
            return False
        device.websocket = None
        return True

    def is_waiting_to_reconnect(self, device_id: str) -> bool:
        device = self.devices.get(device_id)
        return device is not None and device.websocket is None

    def take_pending_messages(self, device_id: str) -> list[dict]:
        device = self.devices.get(device_id)
        if not device:
            return []
        pending, device.pending_messages = device.pending_messages, []
        return pending

    def get_room_peers(self, room_id: str, exclude_id: str) -> list[dict]:
        if room_id not in self.rooms:
            return []
        return [
            {
                "device_id": d,
                "device_name": self.devices[d].device_name,
                "device_type": self.devices[d].device_type,
                "is_busy": self.devices[d].is_busy
            }
            for d in self.rooms[room_id] if d != exclude_id
        ]

    def update_device_status(self, device_id: str, is_busy: bool):
        if device_id in self.devices:
            self.devices[device_id].is_busy = is_busy
            return self.devices[device_id]
        return None

    async def send_to(self, device_id: str, message: dict, queue_if_offline: bool = False):
        device = self.devices.get(device_id)
        if not device:
            return
        if device.websocket is None:
            if queue_if_offline and len(device.pending_messages) < MAX_PENDING_MESSAGES:
                device.pending_messages.append(message)
            return
        try:
            await device.websocket.send_json(message)
        except Exception:
            pass

    async def broadcast_room(self, room_id: str, message: dict, exclude_id: str | None = None):
        if room_id not in self.rooms:
            return
        for device_id in list(self.rooms[room_id]):
            if device_id != exclude_id:
                await self.send_to(device_id, message)

manager = ConnectionManager()
