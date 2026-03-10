import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.connection_manager import ConnectionManager

router = APIRouter()
manager = ConnectionManager()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket signaling endpoint.
    Note: WebSockets do not appear in FastAPI Swagger UI (/docs) natively
    as OpenAPI specification does not fully support WebSocket endpoints.
    """
    await websocket.accept()
    device_id: str | None = None

    try:
        raw = await websocket.receive_text()
        data = json.loads(raw)

        if data.get("type") != "join" or "name" not in data:
            await websocket.close(code=1008, reason="First message must be a join message")
            return

        device_id = await manager.register(websocket, data["name"])
        await manager.broadcast_device_list()

        while True:
            raw_msg = await websocket.receive_text()
            try:
                msg_data = json.loads(raw_msg)
                if msg_data.get("type") == "name_change" and "name" in msg_data:
                    manager.update_name(device_id, msg_data["name"])
                    await manager.broadcast_device_list()
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if device_id:
            manager.disconnect(device_id)
            await manager.broadcast_device_list()
