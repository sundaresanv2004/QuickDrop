from fastapi import APIRouter
from app.api.endpoints import health

router = APIRouter()
router.include_router(health.router)
