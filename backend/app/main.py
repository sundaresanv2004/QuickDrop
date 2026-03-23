import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.route import router as api_router
from app.ws.route import router as ws_router

app = FastAPI(title="QuickDrop", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")

@app.on_event("startup")
async def startup_event():
    print("QuickDrop backend started")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
