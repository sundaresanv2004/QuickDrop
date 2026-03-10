from fastapi import APIRouter
from app.api.endpoints import health, ws

api_router = APIRouter()

# Include HTTP endpoints
api_router.include_router(health.router)

# Include WebSocket endpoints
api_router.include_router(ws.router)
