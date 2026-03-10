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
        
        print(f"WS received initial message: {data}")

        if data.get("type") != "join" or "name" not in data:
            print("WS rejecting: First message must be a join message")
            await websocket.close(code=1008, reason="First message must be a join message")
            return

        device_id = await manager.register(websocket, data["name"])
        print(f"WS device joined: {device_id} ({data['name']})")
        await manager.broadcast_device_list()

        while True:
            raw_msg = await websocket.receive_text()
            try:
                msg_data = json.loads(raw_msg)
                msg_type = msg_data.get("type")

                if msg_type == "name_change" and "name" in msg_data:
                    manager.update_name(device_id, msg_data["name"])
                    await manager.broadcast_device_list()
                
                # Intercept signaling messages
                elif msg_type in [
                    "connection-request",
                    "connection-accept",
                    "connection-reject",
                    "offer",
                    "answer",
                    "ice-candidate",
                ]:
                    target = msg_data.get("target")
                    if target:
                        # Inject sender ID so target knows who the message is from
                        msg_data["sender"] = device_id
                        
                        # Remove 'target' from payload (optional, but cleaner)
                        del msg_data["target"]

                        forward_payload = json.dumps(msg_data)
                        print(f"WS forwarding {msg_type} from {device_id} to {target}")
                        await manager.send_personal_message(forward_payload, target)
                    else:
                        print(f"WS missing 'target' in {msg_type} message from {device_id}")

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        print(f"WS disconnected expectedly: {device_id}")
    except Exception as e:
        print(f"WS error: {e}")
    finally:
        if device_id:
            print(f"WS removing device: {device_id}")
            manager.disconnect(device_id)
            await manager.broadcast_device_list()
