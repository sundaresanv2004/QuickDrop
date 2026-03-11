import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.connection_manager import ConnectionManager
from app.models.device import ChatMode

router = APIRouter()
manager = ConnectionManager()


def _get_client_ip(websocket: WebSocket) -> str:
    """Extract the real client IP from the WebSocket connection."""
    x_forwarded = websocket.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()

    x_real = websocket.headers.get("x-real-ip")
    if x_real:
        return x_real.strip()

    if websocket.client:
        return websocket.client.host

    return "unknown"


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket signaling endpoint.

    Devices are isolated by their public IP address (network room).
    Only devices on the same local network can discover each other
    and exchange signaling messages.
    """
    await websocket.accept()
    device_id: str | None = None
    client_ip = _get_client_ip(websocket)

    try:
        raw = await websocket.receive_text()
        data = json.loads(raw)

        print(f"WS received initial message from {client_ip}: {data}")

        if data.get("type") != "join" or "name" not in data:
            print("WS rejecting: First message must be a join message")
            await websocket.close(code=1008, reason="First message must be a join message")
            return

        device_id = await manager.register(websocket, data["name"], client_ip)
        print(f"WS device joined: {device_id} ({data['name']}) in room {client_ip}")
        await manager.broadcast_device_list(device_id)

        while True:
            raw_msg = await websocket.receive_text()
            try:
                msg_data = json.loads(raw_msg)
                msg_type = msg_data.get("type")

                if msg_type == "name_change" and "name" in msg_data:
                    manager.update_name(device_id, msg_data["name"])
                    await manager.broadcast_device_list(device_id)

                # --- Chat logic ---
                elif msg_type == "chat-request":
                    target = msg_data.get("target")
                    if target and manager.are_in_same_room(device_id, target):
                        msg_data["sender"] = device_id
                        del msg_data["target"]
                        await manager.send_personal_message(json.dumps(msg_data), target)

                elif msg_type == "chat-accept":
                    target = msg_data.get("target")
                    if target and manager.are_in_same_room(device_id, target):
                        chat_id = manager.create_chat(device_id, target)
                        if chat_id:
                            update_msg = json.dumps({
                                "type": "chat-update",
                                "chat_id": chat_id,
                                "participants": [device_id, target],
                                "admin_id": device_id,
                                "mode": "private"
                            })
                            # Forward acceptance to initiator so they can start WebRTC
                            msg_data["sender"] = device_id
                            del msg_data["target"]
                            await manager.send_personal_message(json.dumps(msg_data), target)
                            
                            # Update system state for both
                            await manager.send_personal_message(update_msg, device_id)
                            await manager.send_personal_message(update_msg, target)

                elif msg_type == "chat-reject":
                    target = msg_data.get("target")
                    if target and manager.are_in_same_room(device_id, target):
                        msg_data["sender"] = device_id
                        del msg_data["target"]
                        await manager.send_personal_message(json.dumps(msg_data), target)

                elif msg_type == "chat-leave":
                    client = manager.get_client(device_id)
                    chat = manager.get_chat(client.device_info.active_chat_id) if client and client.device_info.active_chat_id else None
                    if chat:
                        participants = list(chat.participants)
                        manager.leave_chat(device_id)
                        
                        update_msg = json.dumps({
                            "type": "chat-update",
                            "chat_id": None,
                            "participants": [],
                            "admin_id": None,
                            "mode": None
                        })
                        for p in participants:
                            await manager.send_personal_message(update_msg, p)
                            
                        # Refresh scanner so the departed users reappear as Idle
                        room_ip = manager.get_room_for_device(device_id)
                        if room_ip:
                            await manager.broadcast_device_list_to_room(room_ip)

                # --- Public Chat Management ---
                elif msg_type == "chat-mode-change":
                    mode_str = msg_data.get("mode")
                    client = manager.get_client(device_id)
                    chat_id = client.device_info.active_chat_id if client else None
                    if chat_id:
                        chat = manager.get_chat(chat_id)
                        if chat and chat.admin_id == device_id:
                            chat.mode = ChatMode(mode_str)
                            # Mode changed, we need to broadcast so the scanner updates its public chats payload
                            room_ip = manager.get_room_for_device(device_id)
                            if room_ip:
                                await manager.broadcast_device_list_to_room(room_ip)

                elif msg_type == "public-chat-join":
                    target_chat_id = msg_data.get("chat_id")
                    chat = manager.get_chat(target_chat_id)
                    if chat and chat.mode == ChatMode.PUBLIC:
                        # Forward request to Admin
                        msg_data["sender"] = device_id
                        await manager.send_personal_message(json.dumps(msg_data), chat.admin_id)

                elif msg_type == "public-chat-accept":
                    scanner_device_id = msg_data.get("target")
                    client = manager.get_client(device_id)
                    chat_id = client.device_info.active_chat_id if client else None
                    chat = manager.get_chat(chat_id) if chat_id else None
                    
                    if chat and chat.admin_id == device_id:
                        # Allow scanner to join
                        scanner_client = manager.get_client(scanner_device_id)
                        if scanner_client:
                            manager.leave_chat(scanner_device_id) # Ensure scanner is clean
                            chat.participants.append(scanner_device_id)
                            scanner_client.device_info.active_chat_id = chat.id
                            
                            update_msg = json.dumps({
                                "type": "chat-update",
                                "chat_id": chat.id,
                                "participants": chat.participants,
                                "admin_id": chat.admin_id,
                                "mode": chat.mode
                            })
                            # Send full list updates to all members
                            for p in chat.participants:
                                await manager.send_personal_message(update_msg, p)
                                
                            room_ip = manager.get_room_for_device(device_id)
                            if room_ip:
                                await manager.broadcast_device_list_to_room(room_ip)

                elif msg_type == "public-chat-reject":
                    scanner_device_id = msg_data.get("target")
                    client = manager.get_client(device_id)
                    chat_id = client.device_info.active_chat_id if client else None
                    chat = manager.get_chat(chat_id) if chat_id else None
                    if chat and chat.admin_id == device_id:
                        msg_data["sender"] = device_id
                        del msg_data["target"]
                        await manager.send_personal_message(json.dumps(msg_data), scanner_device_id)


                # Intercept WebRTC signaling messages
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
                        # SECURITY: Only allow signaling within the same room
                        if not manager.are_in_same_room(device_id, target):
                            print(
                                f"WS BLOCKED cross-network {msg_type} "
                                f"from {device_id} to {target}"
                            )
                            continue

                        # Inject sender ID so target knows who the message is from
                        msg_data["sender"] = device_id

                        # Remove 'target' from payload (cleaner for the receiver)
                        if "target" in msg_data:
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
            print(f"WS removing device: {device_id} from room {client_ip}")

            client = manager.get_client(device_id)
            chat = manager.get_chat(client.device_info.active_chat_id) if client and client.device_info.active_chat_id else None
            if chat:
                participants = list(chat.participants)
                manager.leave_chat(device_id)
                update_msg = json.dumps({
                    "type": "chat-update",
                    "chat_id": None,
                    "participants": [],
                    "admin_id": None,
                    "mode": None
                })
                for p in participants:
                    if p != device_id:
                        await manager.send_personal_message(update_msg, p)

            room_ip = manager.get_room_for_device(device_id)
            manager.disconnect(device_id)
            if room_ip:
                await manager.broadcast_device_list_to_room(room_ip)
