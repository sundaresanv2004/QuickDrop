from fastapi import APIRouter
from app.api.endpoints import health, debug, preview

router = APIRouter()
router.include_router(health.router)
router.include_router(debug.router)
router.include_router(preview.router)

