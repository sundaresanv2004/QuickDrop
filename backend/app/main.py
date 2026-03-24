import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.route import router as api_router
from app.ws.route import router as ws_router

app = FastAPI(title="QuickDrop", version="0.1.0")

# Explicitly allow the known frontend domains for robust CORS
import os

# Robust CORS Setup
env_origins = os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
origins = [
    "https://quickdrop.sundaresan.dev",
    "https://api-quickdrop.sundaresan.dev",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
# Add origins from environment if provided
if env_origins:
    origins.extend([o.strip() for o in env_origins if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,  # Changed to True to be more flexible for some browsers
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")

@app.get("/")
async def root():
    return {"status": "QuickDrop backend running"}

@app.on_event("startup")
async def startup_event():
    print("QuickDrop backend started")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
