from fastapi import APIRouter
from app.websockets.endpoints.ws import manager

router = APIRouter()

@router.get("/devices", tags=["Debug"])
async def get_devices():
    """Debug endpoint to list all currently connected devices."""
    return {"devices": [client.device_info for room in manager._rooms.values() for client in room.clients.values()]}
