from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import uuid
import json

import socket

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

router = APIRouter()

@router.websocket("/connect")
async def signaling_endpoint(websocket: WebSocket):
    # STEP A: Connect
    device_id = str(uuid.uuid4())
    
    # Try getting real IP from headers first (if behind proxy), then fallback to client host
    forwarded_for = websocket.headers.get("x-forwarded-for")
    ip = forwarded_for.split(",")[0].strip() if forwarded_for else websocket.client.host
    
    # If connection is coming from the same machine, report its actual LAN IP
    if ip in ("127.0.0.1", "localhost", "::1"):
        ip = get_local_ip()
        
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
