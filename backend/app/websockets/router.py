from fastapi import APIRouter
from app.websockets.endpoints import ws

router = APIRouter()

# Include WebSocket endpoints
router.include_router(ws.router)
