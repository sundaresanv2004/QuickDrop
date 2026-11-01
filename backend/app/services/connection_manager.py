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
        self.links: dict[str, set[str]] = {}        # device_id → devices linked across rooms
        self.pair_tokens: dict[str, tuple[str, float]] = {}  # token → (creator device_id, expiry)

    def create_pair_token(self, device_id: str, lifetime_seconds: float) -> str:
        """Each device has one active link, so a new token replaces the previous one."""
        self.revoke_pair_tokens(device_id)
        token = secrets.token_urlsafe(16)  # 128 bits
        self.pair_tokens[token] = (device_id, time.monotonic() + lifetime_seconds)
        return token

    def revoke_pair_tokens(self, device_id: str):
        for token, (creator_id, _) in list(self.pair_tokens.items()):
            if creator_id == device_id:
                del self.pair_tokens[token]

    def redeem_pair_token(self, token: str, joiner_id: str) -> tuple[str | None, str | None]:
        """Returns (creator_id, None) on success, or (None, reason). A token works once."""
        creator_id, expires_at = self.pair_tokens.get(token, (None, 0.0))
        if creator_id is None or time.monotonic() >= expires_at or creator_id not in self.devices:
            self.pair_tokens.pop(token, None)
            return None, "invalid"
        if creator_id == joiner_id:
            return None, "self"
        del self.pair_tokens[token]
        self.link(creator_id, joiner_id)
        return creator_id, None

    def link(self, first_id: str, second_id: str):
        self.links.setdefault(first_id, set()).add(second_id)
        self.links.setdefault(second_id, set()).add(first_id)

    def _unlink_all(self, device_id: str):
        for other_id in self.links.pop(device_id, set()):
            others = self.links.get(other_id)
            if others:
                others.discard(device_id)
                if not others:
                    self.links.pop(other_id, None)

    def can_relay(self, from_id: str, to_id: str) -> bool:
        if to_id not in self.devices:
            return False
        same_room = self.device_rooms.get(from_id) == self.device_rooms.get(to_id)
        return same_room or to_id in self.links.get(from_id, set())

    def visible_devices(self, device_id: str) -> set[str]:
        room_id = self.device_rooms.get(device_id)
        members = self.rooms.get(room_id, set()) if room_id else set()
        return (members | self.links.get(device_id, set())) - {device_id}

    def describe_peer(self, peer_id: str, viewer_id: str) -> dict:
        device = self.devices[peer_id]
        return {
            "device_id": peer_id,
            "device_name": device.device_name,
            "device_type": device.device_type,
            "is_busy": device.is_busy,
            "is_linked": self.device_rooms.get(peer_id) != self.device_rooms.get(viewer_id),
        }

    def get_visible_peers(self, device_id: str) -> list[dict]:
        return [self.describe_peer(peer_id, device_id) for peer_id in self.visible_devices(device_id)]

    async def notify_visible(self, device_id: str, message: dict):
        for peer_id in self.visible_devices(device_id):
            await self.send_to(peer_id, message)

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
        self._unlink_all(device_id)
        self.revoke_pair_tokens(device_id)
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

manager = ConnectionManager()
