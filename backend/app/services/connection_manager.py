from fastapi import WebSocket
from app.models.device import DeviceInfo

class ConnectionManager:
    def __init__(self):
        self.devices: dict[str, DeviceInfo] = {}    # device_id → DeviceInfo
        self.rooms: dict[str, set[str]] = {}        # ip → set of device_ids

    async def connect(self, websocket: WebSocket, device_id: str, device_name: str, ip: str, device_type: str = "unknown"):
        await websocket.accept()
        self.devices[device_id] = DeviceInfo(
            device_id=device_id,
            device_name=device_name,
            ip=ip,
            websocket=websocket,
            device_type=device_type
        )
        if ip not in self.rooms:
            self.rooms[ip] = set()
        self.rooms[ip].add(device_id)

    def disconnect(self, device_id: str):
        if device_id not in self.devices:
            return
        device = self.devices[device_id]
        if device.ip in self.rooms and device_id in self.rooms[device.ip]:
            self.rooms[device.ip].remove(device_id)
            if not self.rooms[device.ip]:
                self.rooms.pop(device.ip, None)
        self.devices.pop(device_id, None)

    def get_room_peers(self, ip: str, exclude_id: str) -> list[dict]:
        if ip not in self.rooms:
            return []
        return [
            {
                "device_id": d, 
                "device_name": self.devices[d].device_name,
                "device_type": self.devices[d].device_type
            }
            for d in self.rooms[ip] if d != exclude_id
        ]

    async def send_to(self, device_id: str, message: dict):
        if device_id not in self.devices:
            return
        try:
            await self.devices[device_id].websocket.send_json(message)
        except Exception:
            pass

    async def broadcast_room(self, ip: str, message: dict, exclude_id: str | None = None):
        if ip not in self.rooms:
            return
        for device_id in list(self.rooms[ip]):
            if device_id != exclude_id:
                await self.send_to(device_id, message)

manager = ConnectionManager()
