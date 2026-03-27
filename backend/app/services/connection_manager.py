from fastapi import WebSocket
from app.models.device import DeviceInfo

class ConnectionManager:
    def __init__(self):
        self.devices: dict[str, DeviceInfo] = {}    # device_id → DeviceInfo
        self.rooms: dict[str, set[str]] = {}        # room_id → set of device_ids
        self.device_rooms: dict[str, str] = {}      # device_id → room_id

    async def connect(self, websocket: WebSocket, device_id: str, device_name: str, ip: str, room_id: str, device_type: str = "unknown"):
        self.devices[device_id] = DeviceInfo(
            device_id=device_id,
            device_name=device_name,
            ip=ip,
            websocket=websocket,
            device_type=device_type
        )
        self.device_rooms[device_id] = room_id
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(device_id)

    def disconnect(self, device_id: str):
        if device_id not in self.devices:
            return
        
        room_id = self.device_rooms.get(device_id)
        if room_id and room_id in self.rooms:
            self.rooms[room_id].discard(device_id)
            if not self.rooms[room_id]:
                self.rooms.pop(room_id, None)
        
        self.device_rooms.pop(device_id, None)
        self.devices.pop(device_id, None)

    def get_room_peers(self, room_id: str, exclude_id: str) -> list[dict]:
        if room_id not in self.rooms:
            return []
        return [
            {
                "device_id": d, 
                "device_name": self.devices[d].device_name,
                "device_type": self.devices[d].device_type
            }
            for d in self.rooms[room_id] if d != exclude_id
        ]

    async def send_to(self, device_id: str, message: dict):
        if device_id not in self.devices:
            return
        try:
            await self.devices[device_id].websocket.send_json(message)
        except Exception:
            pass

    async def broadcast_room(self, room_id: str, message: dict, exclude_id: str | None = None):
        if room_id not in self.rooms:
            return
        for device_id in list(self.rooms[room_id]):
            if device_id != exclude_id:
                await self.send_to(device_id, message)

manager = ConnectionManager()
