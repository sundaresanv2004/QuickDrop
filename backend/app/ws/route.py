from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import uuid
import json
import asyncio
import time
import socket
import ipaddress
import hashlib

# ---------------------------------------------------------------------------
# IP Utilities
# ---------------------------------------------------------------------------

_cached_local_ip = None

def get_local_ip():
    global _cached_local_ip
    if _cached_local_ip:
        return _cached_local_ip
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
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
        addr = ipaddress.ip_address(ip_str)
        if addr.version == 6:
            net = ipaddress.IPv6Network(f"{ip_str}/64", strict=False)
            return str(net.network_address)
        if addr.version == 4:
            return str(addr)
    except Exception:
        if ":" in ip_str:
            parts = ip_str.split(":")
            if len(parts) >= 4:
                return ":".join(parts[:4])
        return ip_str

def describe_room(room_id: str) -> dict:
    """
    Safe room summary for diagnostics, sent only to the device in that room.
    Lets two devices compare rooms without displaying an IP address.
    """
    return {
        "ip_version": 6 if ":" in room_id else 4,
        "hint": hashlib.sha256(room_id.encode()).hexdigest()[:8],
    }

# ---------------------------------------------------------------------------
# Rate Limiting — In-Memory (no external dependencies)
# ---------------------------------------------------------------------------

# Track active WebSocket connections per public IP
# Format: { ip_str: count }
_ip_connection_counts: dict[str, int] = {}
MAX_CONNECTIONS_PER_IP = 10

# Track connect_request timestamps per device to prevent spam
# Format: { device_id: [timestamp, timestamp, ...] }
_connect_request_timestamps: dict[str, list[float]] = {}
MAX_CONNECT_REQUESTS_PER_MINUTE = 5

def _check_connection_allowed(ip: str) -> bool:
    """Returns True if this IP is under the connection limit."""
    return _ip_connection_counts.get(ip, 0) < MAX_CONNECTIONS_PER_IP

def _register_connection(ip: str):
    _ip_connection_counts[ip] = _ip_connection_counts.get(ip, 0) + 1

def _unregister_connection(ip: str):
    count = _ip_connection_counts.get(ip, 0)
    if count <= 1:
        _ip_connection_counts.pop(ip, None)
    else:
        _ip_connection_counts[ip] = count - 1

def _check_connect_request_allowed(device_id: str) -> bool:
    """Returns True if this device hasn't exceeded the connect_request rate limit."""
    now = time.monotonic()
    window_start = now - 60.0  # 1-minute sliding window
    timestamps = _connect_request_timestamps.get(device_id, [])
    # Prune old timestamps outside the window
    timestamps = [t for t in timestamps if t > window_start]
    _connect_request_timestamps[device_id] = timestamps
    return len(timestamps) < MAX_CONNECT_REQUESTS_PER_MINUTE

def _record_connect_request(device_id: str):
    now = time.monotonic()
    if device_id not in _connect_request_timestamps:
        _connect_request_timestamps[device_id] = []
    _connect_request_timestamps[device_id].append(now)

# ---------------------------------------------------------------------------
# Heartbeat — Ping/Pong ghost connection detection
# ---------------------------------------------------------------------------

# Stores asyncio Events that the message loop sets when a pong arrives.
# Format: { device_id: asyncio.Event }
_pending_pongs: dict[str, asyncio.Event] = {}

HEARTBEAT_INTERVAL = 30  # seconds between pings
PONG_TIMEOUT = 10        # seconds to wait for a pong before declaring ghost

async def _heartbeat_loop(websocket: WebSocket, device_id: str):
    """
    Runs as a background task for each connected device.
    Sends a ping every HEARTBEAT_INTERVAL seconds.
    If no pong is received within PONG_TIMEOUT seconds, forcibly closes
    the WebSocket, which causes the main message loop to raise an exception
    and trigger the cleanup (disconnect + peer_left broadcast).
    """
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)

            # Create the event BEFORE sending ping so the pong handler can
            # set it even if the pong arrives immediately.
            pong_event = asyncio.Event()
            _pending_pongs[device_id] = pong_event

            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                # WebSocket already closed; stop the heartbeat.
                break

            try:
                await asyncio.wait_for(pong_event.wait(), timeout=PONG_TIMEOUT)
            except asyncio.TimeoutError:
                # No pong received — ghost connection. Force close.
                print(f"[Heartbeat] Ghost detected: {device_id}. Closing.")
                try:
                    await websocket.close()
                except Exception:
                    pass
                break
    except asyncio.CancelledError:
        pass
    finally:
        _pending_pongs.pop(device_id, None)

# ---------------------------------------------------------------------------
# WebSocket Route
# ---------------------------------------------------------------------------

router = APIRouter()

@router.websocket("/connect")
async def signaling_endpoint(websocket: WebSocket):
    # STEP 0: Resolve the client's IP before accepting so we can rate-limit
    headers = websocket.headers
    ip = (
        headers.get("cf-connecting-ip") or
        headers.get("x-real-ip") or
        (headers.get("x-forwarded-for") or "").split(",")[0].strip() or
        websocket.client.host
    )
    if ip in ("127.0.0.1", "localhost", "::1"):
        ip = get_local_ip()

    # STEP 1: Enforce connection limit BEFORE accepting the WebSocket
    if not _check_connection_allowed(ip):
        await websocket.close(code=1008, reason="Too many connections from this IP")
        return

    # STEP 2: Accept the connection and register it
    await websocket.accept()
    _register_connection(ip)

    device_id = str(uuid.uuid4())
    room_id = normalize_ip_to_room(ip)
    await manager.connect(websocket, device_id, "Unknown", ip, room_id=room_id)

    # STEP 3: Send Welcome
    await websocket.send_json({"type": "welcome", "device_id": device_id, "room": describe_room(room_id)})

    # STEP 4: Send current peer list
    peers = manager.get_room_peers(room_id, exclude_id=device_id)
    await websocket.send_json({"type": "peer_list", "peers": peers})

    # STEP 5: Start the heartbeat background task
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket, device_id))

    # STEP 6: Main message loop
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            # --- Heartbeat: respond to ping ---
            if msg_type == "pong":
                event = _pending_pongs.get(device_id)
                if event:
                    event.set()

            elif msg_type == "register":
                manager.devices[device_id].device_name = msg["device_name"]
                manager.devices[device_id].device_type = msg.get("device_type", "unknown")
                await manager.broadcast_room(room_id, {
                    "type": "peer_joined",
                    "device_id": device_id,
                    "device_name": msg["device_name"],
                    "device_type": manager.devices[device_id].device_type,
                    "is_busy": manager.devices[device_id].is_busy
                }, exclude_id=device_id)

            elif msg_type == "update_status":
                is_busy = msg.get("is_busy", False)
                manager.update_device_status(device_id, is_busy)
                await manager.broadcast_room(room_id, {
                    "type": "peer_updated",
                    "device_id": device_id,
                    "device_name": manager.devices[device_id].device_name,
                    "device_type": manager.devices[device_id].device_type,
                    "is_busy": is_busy
                }, exclude_id=device_id)

            elif msg_type == "connect_request":
                # Rate-limit: drop silently if exceeded
                if not _check_connect_request_allowed(device_id):
                    print(f"[RateLimit] connect_request dropped for {device_id}")
                    continue
                _record_connect_request(device_id)
                msg["from_id"] = device_id
                await manager.send_to(msg["to"], msg)

            elif msg.get("to") is not None:
                # All other targeted messages (sdp_offer, sdp_answer, ice_candidate, etc.)
                msg["from_id"] = device_id
                await manager.send_to(msg["to"], msg)

    except Exception:
        pass
    finally:
        # STEP 7: Clean up everything on disconnect
        heartbeat_task.cancel()
        _pending_pongs.pop(device_id, None)
        _connect_request_timestamps.pop(device_id, None)
        _unregister_connection(ip)
        manager.disconnect(device_id)
        await manager.broadcast_room(room_id, {
            "type": "peer_left",
            "device_id": device_id
        }, exclude_id=device_id)
