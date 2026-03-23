from fastapi import APIRouter
from app.api.endpoints import health, debug

router = APIRouter()
router.include_router(health.router)
router.include_router(debug.router)

