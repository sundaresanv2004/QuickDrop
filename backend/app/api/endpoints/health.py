from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
async def health_check():
    return {
        "status": "ok",
        "service": "QuickDrop API",
        "version": "0.1.0"
    }
