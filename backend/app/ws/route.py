from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import uuid
import json
import asyncio
import time
import socket
import ipaddress
import hashlib
import os
import secrets

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

FORWARDING_HEADERS = ("cf-connecting-ip", "x-real-ip", "x-forwarded-for")
_warned_about_proxy = False

def resolve_client_ip(headers, socket_host: str) -> str:
    """
    Clients can send any header they like, so one is trusted only when
    TRUSTED_PROXY_HEADER names the header set by the proxy in front of this server.
    """
    global _warned_about_proxy
    trusted_header = os.getenv("TRUSTED_PROXY_HEADER", "").strip().lower()
    if trusted_header:
        value = headers.get(trusted_header)
        if value:
            # A proxy appends the address it saw, so anything earlier could be forged.
            return value.split(",")[-1].strip()
    elif not _warned_about_proxy and any(headers.get(name) for name in FORWARDING_HEADERS):
        _warned_about_proxy = True
        print("[Discovery] Proxy headers found but TRUSTED_PROXY_HEADER is not set. "
              "Behind a proxy, every device will land in the same room until it is set.")
    return socket_host

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
# Keyed per socket because a device can move to a new socket on reconnect.
# Format: { id(websocket): asyncio.Event }
_pending_pongs: dict[int, asyncio.Event] = {}

HEARTBEAT_INTERVAL = 30  # seconds between pings
PONG_TIMEOUT = 10        # seconds to wait for a pong before declaring ghost

async def _heartbeat_loop(websocket: WebSocket):
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
            _pending_pongs[id(websocket)] = pong_event

            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                # WebSocket already closed; stop the heartbeat.
                break

            try:
                await asyncio.wait_for(pong_event.wait(), timeout=PONG_TIMEOUT)
            except asyncio.TimeoutError:
                # No pong received — ghost connection. Force close.
                print("[Heartbeat] Ghost connection detected. Closing.")
                try:
                    await websocket.close()
                except Exception:
                    pass
                break
    except asyncio.CancelledError:
        pass
    finally:
        _pending_pongs.pop(id(websocket), None)

# ---------------------------------------------------------------------------
# WebSocket Route
# ---------------------------------------------------------------------------

router = APIRouter()

FIRST_MESSAGE_TIMEOUT = 10       # seconds a new socket has to identify itself
RECONNECT_GRACE_SECONDS = 30     # seconds a dropped device keeps its session
REPLACED_CLOSE_CODE = 4001       # tells an older socket a newer one took over
PAIR_LINK_LIFETIME_SECONDS = 300 # how long a QR code or link stays usable

_expiry_tasks: dict[str, asyncio.Task] = {}

async def _announce(device_id: str, message_type: str):
    device = manager.devices[device_id]
    await manager.notify_visible(device_id, {
        "type": message_type,
        "device_id": device_id,
        "device_name": device.device_name,
        "device_type": device.device_type,
        "is_busy": device.is_busy,
    })

async def _remove_device(device_id: str):
    visible = manager.visible_devices(device_id)
    _connect_request_timestamps.pop(device_id, None)
    _expiry_tasks.pop(device_id, None)
    manager.disconnect(device_id)
    for peer_id in visible:
        await manager.send_to(peer_id, {"type": "peer_left", "device_id": device_id})

async def _expire_device(device_id: str):
    await asyncio.sleep(RECONNECT_GRACE_SECONDS)
    if manager.is_waiting_to_reconnect(device_id):
        await _remove_device(device_id)

async def _open_session(websocket: WebSocket, first: dict, ip: str, room_id: str) -> tuple[str, bool]:
    """Resumes the device's earlier session if it proves ownership, or starts a new one."""
    device_name = first["device_name"]
    device_type = first.get("device_type", "unknown")
    resume_id = first.get("resume_device_id")

    if not manager.can_resume(resume_id, first.get("resume_secret")):
        device_id = str(uuid.uuid4())
        await manager.connect(websocket, device_id, device_name, ip, room_id=room_id,
                              device_type=device_type, session_secret=secrets.token_urlsafe(32))
        return device_id, False

    expiry = _expiry_tasks.pop(resume_id, None)
    if expiry:
        expiry.cancel()

    previously_visible = manager.visible_devices(resume_id)
    previous_socket, _ = manager.resume(resume_id, websocket, ip, room_id)
    manager.devices[resume_id].device_name = device_name
    manager.devices[resume_id].device_type = device_type

    if previous_socket is not None:
        try:
            await previous_socket.close(code=REPLACED_CLOSE_CODE)
        except Exception:
            pass
    for peer_id in previously_visible - manager.visible_devices(resume_id):
        await manager.send_to(peer_id, {"type": "peer_left", "device_id": resume_id})
    return resume_id, True

async def _join_pair_link(device_id: str, token: str):
    creator_id, error = manager.redeem_pair_token(token, device_id)
    if error:
        await manager.send_to(device_id, {"type": "pair_error", "reason": error})
        return
    await manager.send_to(device_id, {"type": "pair_joined", "peer": manager.describe_peer(creator_id, device_id)})
    await manager.send_to(creator_id, {"type": "pair_joined", "peer": manager.describe_peer(device_id, creator_id)})

@router.websocket("/connect")
async def signaling_endpoint(websocket: WebSocket):
    # STEP 0: Resolve the client's IP before accepting so we can rate-limit
    ip = resolve_client_ip(websocket.headers, websocket.client.host)
    if ip in ("127.0.0.1", "localhost", "::1"):
        ip = get_local_ip()

    # STEP 1: Enforce connection limit BEFORE accepting the WebSocket
    if not _check_connection_allowed(ip):
        await websocket.close(code=1008, reason="Too many connections from this IP")
        return

    # STEP 2: Accept the connection
    await websocket.accept()
    _register_connection(ip)

    room_id = normalize_ip_to_room(ip)
    device_id = None
    heartbeat_task = None
    has_left = False

    try:
        # STEP 3: The first message identifies the device, so it never appears
        # to peers without a name and can resume its previous session.
        first = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=FIRST_MESSAGE_TIMEOUT))
        if first.get("type") != "register":
            await websocket.close(code=1008, reason="Expected register")
            return
        device_id, resumed = await _open_session(websocket, first, ip, room_id)

        # STEP 4: Send Welcome
        await websocket.send_json({
            "type": "welcome",
            "device_id": device_id,
            "session_secret": manager.devices[device_id].session_secret,
            "resumed": resumed,
            "room": describe_room(room_id),
        })

        # STEP 5: Send current peer list and anything that arrived while offline
        await websocket.send_json({"type": "peer_list", "peers": manager.get_visible_peers(device_id)})
        for message in manager.take_pending_messages(device_id):
            await websocket.send_json(message)

        await _announce(device_id, "peer_joined")

        # STEP 6: Start the heartbeat background task
        heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket))

        # STEP 7: Main message loop
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            # --- Heartbeat: respond to ping ---
            if msg_type == "pong":
                event = _pending_pongs.get(id(websocket))
                if event:
                    event.set()

            elif msg_type == "leave":
                has_left = True
                break

            elif msg_type == "register":
                manager.devices[device_id].device_name = msg["device_name"]
                manager.devices[device_id].device_type = msg.get("device_type", "unknown")
                await _announce(device_id, "peer_joined")

            elif msg_type == "update_status":
                manager.update_device_status(device_id, msg.get("is_busy", False))
                await _announce(device_id, "peer_updated")

            elif msg_type == "create_pair_link":
                token = manager.create_pair_token(device_id, PAIR_LINK_LIFETIME_SECONDS)
                await websocket.send_json({"type": "pair_link", "token": token, "expires_in": PAIR_LINK_LIFETIME_SECONDS})

            elif msg_type == "cancel_pair_link":
                manager.revoke_pair_tokens(device_id)

            elif msg_type == "join_pair_link":
                await _join_pair_link(device_id, str(msg.get("token", "")))

            elif msg.get("to") is not None:
                # Targeted messages only reach devices this one is allowed to see.
                if not manager.can_relay(device_id, msg["to"]):
                    continue

                if msg_type == "connect_request":
                    # Rate-limit: drop silently if exceeded
                    if not _check_connect_request_allowed(device_id):
                        print(f"[RateLimit] connect_request dropped for {device_id}")
                        continue
                    _record_connect_request(device_id)
                elif msg_type == "connect_accept":
                    # Keeps signaling working if either device changes network mid-session.
                    manager.link(device_id, msg["to"])

                msg["from_id"] = device_id
                await manager.send_to(msg["to"], msg, queue_if_offline=True)

    except Exception:
        pass
    finally:
        # STEP 8: A deliberate leave ends the session now. A dropped socket gets
        # time to reconnect, so a brief network loss doesn't look like leaving.
        if heartbeat_task:
            heartbeat_task.cancel()
        _pending_pongs.pop(id(websocket), None)
        _unregister_connection(ip)
        if device_id:
            if has_left:
                await _remove_device(device_id)
            elif manager.mark_disconnected(device_id, websocket):
                _expiry_tasks[device_id] = asyncio.create_task(_expire_device(device_id))
