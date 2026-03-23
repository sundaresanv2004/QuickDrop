from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import uuid
import json

router = APIRouter()

@router.websocket("/connect")
async def signaling_endpoint(websocket: WebSocket):
    # STEP A: Connect
    device_id = str(uuid.uuid4())
    ip = websocket.client.host
    await manager.connect(websocket, device_id, "Unknown", ip)

    # STEP B: Send Welcome
    await websocket.send_json({
        "type": "welcome",
        "device_id": device_id
    })

    # STEP C: Send Peer List
    peers = manager.get_room_peers(ip, exclude_id=device_id)
    await websocket.send_json({
        "type": "peer_list",
        "peers": peers
    })

    # STEP D: Message Loop
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "register":
                manager.devices[device_id].device_name = msg["device_name"]
                await manager.broadcast_room(ip, {
                    "type": "peer_joined",
                    "device_id": device_id,
                    "device_name": msg["device_name"]
                }, exclude_id=device_id)

            elif msg.get("to") is not None:
                msg["from_id"] = device_id
                await manager.send_to(msg["to"], msg)

    # STEP E: Disconnect
    except WebSocketDisconnect:
        manager.disconnect(device_id)
        await manager.broadcast_room(ip, {
            "type": "peer_left",
            "device_id": device_id
        }, exclude_id=device_id)
