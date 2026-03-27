from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import uuid
import json

import socket
import ipaddress

_cached_local_ip = None

def get_local_ip():
    global _cached_local_ip
    if _cached_local_ip:
        return _cached_local_ip
    try:
        # Create a dummy socket to see which IP the OS would use to reach the internet
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5) # Don't block forever
        # Use a common public DNS IP to find the outgoing interface
        s.connect(("8.8.8.8", 80))
        _cached_local_ip = s.getsockname()[0]
        s.close()
        return _cached_local_ip
    except Exception:
        return "127.0.0.1"

def normalize_ip_to_room(ip_str: str) -> str:
    """
    Groups devices into a single 'room'.
    For IPv4: Use the full IP.
    For IPv6: Use the /64 prefix (first 4 blocks), handled robustly via ipaddress.
    """
    try:
        # Use ipaddress to properly handle all IPv6 formats (compressed, etc.)
        addr = ipaddress.ip_address(ip_str)
        if addr.version == 6:
            # Mask to /64 prefix to group devices on the same local network
            net = ipaddress.IPv6Network(f"{ip_str}/64", strict=False)
            return str(net.network_address)
        
        if addr.version == 4:
            return str(addr)
    except Exception:
        # Fallback to simple split if ipaddress fails for any reason
        if ":" in ip_str:
            parts = ip_str.split(":")
            if len(parts) >= 4:
                return ":".join(parts[:4])
        return ip_str

router = APIRouter()

@router.websocket("/connect")
async def signaling_endpoint(websocket: WebSocket):
    # STEP 0: Accept immediately to prevent client-side "Connecting" hang
    await websocket.accept()

    # STEP A: Identify Client
    device_id = str(uuid.uuid4())
    
    # Try getting real IP from headers first (if behind proxy), then fallback to client host
    headers = websocket.headers
    ip = (
        headers.get("cf-connecting-ip") or 
        headers.get("x-real-ip") or 
        (headers.get("x-forwarded-for") or "").split(",")[0].strip() or 
        websocket.client.host
    )
    
    # If connection is coming from the same machine (local debug), use LAN IP
    if ip in ("127.0.0.1", "localhost", "::1"):
        ip = get_local_ip()
    
    # Normalize the IP into a Room ID to handle IPv6 unique-IP-per-device behavior
    room_id = normalize_ip_to_room(ip)
        
    await manager.connect(websocket, device_id, "Unknown", ip, room_id=room_id)

    # STEP B: Send Welcome
    await websocket.send_json({
        "type": "welcome",
        "device_id": device_id
    })

    # STEP C: Send Peer List (Using room_id!)
    peers = manager.get_room_peers(room_id, exclude_id=device_id)
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
                manager.devices[device_id].device_type = msg.get("device_type", "unknown")
                await manager.broadcast_room(room_id, {
                    "type": "peer_joined",
                    "device_id": device_id,
                    "device_name": msg["device_name"],
                    "device_type": manager.devices[device_id].device_type,
                    "is_busy": manager.devices[device_id].is_busy
                }, exclude_id=device_id)

            elif msg.get("type") == "update_status":
                is_busy = msg.get("is_busy", False)
                manager.update_device_status(device_id, is_busy)
                await manager.broadcast_room(room_id, {
                    "type": "peer_updated",
                    "device_id": device_id,
                    "device_name": manager.devices[device_id].device_name,
                    "device_type": manager.devices[device_id].device_type,
                    "is_busy": is_busy
                }, exclude_id=device_id)

            elif msg.get("to") is not None:
                msg["from_id"] = device_id
                await manager.send_to(msg["to"], msg)

    # STEP E: Disconnect
    except Exception:
        pass
    finally:
        manager.disconnect(device_id)
        await manager.broadcast_room(room_id, {
            "type": "peer_left",
            "device_id": device_id
        }, exclude_id=device_id)
