from fastapi import APIRouter
from app.services.connection_manager import manager

router = APIRouter(prefix="/debug", tags=["debug"])

@router.get("/stats")
async def get_stats():
    return {
        "active_connections": len(manager.devices),
        "active_rooms": len(manager.rooms)
    }

@router.get("/devices")
async def get_devices():
    devices = []
    for device_id, info in manager.devices.items():
        devices.append({
            "device_id": device_id,
            "device_name": info.device_name,
            "ip": info.ip
        })
    return {"devices": devices}

@router.get("/rooms")
async def get_rooms():
    rooms_data = {}
    for ip, device_set in manager.rooms.items():
        rooms_data[ip] = list(device_set)
    return {"rooms": rooms_data}

