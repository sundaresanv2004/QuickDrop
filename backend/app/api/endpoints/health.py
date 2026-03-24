import time
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])

START_TIME = time.time()

@router.get("")
async def health_check():
    return {
        "status": "ok",
        "service": "QuickDrop API",
        "version": "0.1.0",
        "uptime": round(time.time() - START_TIME, 1)
    }
