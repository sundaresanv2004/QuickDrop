from fastapi import APIRouter
from app.services.connection_manager import manager
import time
import sys
import platform

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
            "ip": info.ip,
            "device_type": info.device_type,
            "uptime": int(time.time() - info.connected_at) if info.connected_at > 0 else 0
        })
    return {"devices": devices}

@router.get("/system")
async def get_system_stats():
    return {
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.architecture()[0],
        "processor": platform.processor(),
    }

@router.get("/rooms")
async def get_rooms():
    rooms_data = {}
    for room_id, device_set in manager.rooms.items():
        rooms_data[room_id] = list(device_set)
    return {"rooms": rooms_data}

