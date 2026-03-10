from fastapi import APIRouter
from app.api.endpoints import health, ws, devices

api_router = APIRouter()

# Include HTTP endpoints
api_router.include_router(health.router)
api_router.include_router(devices.router)

# Include WebSocket endpoints
api_router.include_router(ws.router)
