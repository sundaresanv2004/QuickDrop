from fastapi import APIRouter
from app.api.endpoints.ws import manager

router = APIRouter()

@router.get("/devices", tags=["Debug"])
async def get_devices():
    """Debug endpoint to list all currently connected devices."""
    return {"devices": manager.get_device_list()}
