import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.models import DeviceInfo, DeviceListMessage, ChatSession, ChatMode, PublicChatSummary


@dataclass
class ConnectedClient:
    """Combines a device's info and its active WebSocket connection."""
    device_info: DeviceInfo
    websocket: WebSocket


@dataclass
class NetworkRoom:
    """Represents a localized network segment (by public IP)."""
    ip_address: str
    clients: dict[str, ConnectedClient] = field(default_factory=dict)


class ConnectionManager:
    """Manages active WebSocket connections, device state, and chat sessions.

    Devices are grouped into "rooms" by their public IP address.
    All devices behind the same router (same Wi-Fi / LAN) share
    the same public IP, so they land in the same room and can
    only see each other — not devices on other networks.
    """

    def __init__(self) -> None:
        # public IP -> NetworkRoom
        self._rooms: dict[str, NetworkRoom] = {}
        # device_id -> public IP (fast reverse lookup for room routing)
        self._client_room_map: dict[str, str] = {}
        # chat_id -> ChatSession
        self._chats: dict[str, ChatSession] = {}

    # --- Core Connection Accessors ---

    def get_client(self, device_id: str) -> ConnectedClient | None:
        """Fetch a connected client via its device ID."""
        room_ip = self._client_room_map.get(device_id)
        if room_ip and room_ip in self._rooms:
            return self._rooms[room_ip].clients.get(device_id)
        return None

    def get_device_info(self, device_id: str) -> DeviceInfo | None:
        client = self.get_client(device_id)
        return client.device_info if client else None

    # --- Registration & Lifecycle ---
    
    async def register(self, websocket: WebSocket, name: str, client_ip: str) -> str:
        """Register a new device connection and return the assigned id."""
        device_id = uuid.uuid4().hex[:8]
        
        if client_ip not in self._rooms:
            self._rooms[client_ip] = NetworkRoom(ip_address=client_ip)
            
        new_client = ConnectedClient(
            device_info=DeviceInfo(id=device_id, name=name),
            websocket=websocket
        )
        
        self._rooms[client_ip].clients[device_id] = new_client
        self._client_room_map[device_id] = client_ip
        
        return device_id

    def update_name(self, device_id: str, new_name: str) -> None:
        """Update the name of an existing device."""
        client = self.get_client(device_id)
        if client:
            client.device_info.name = new_name

    def disconnect(self, device_id: str) -> None:
        """Remove a device from the active connections and its room."""
        # Clean up chat if part of one
        self.leave_chat(device_id)

        room_ip = self._client_room_map.pop(device_id, None)
        if room_ip and room_ip in self._rooms:
            self._rooms[room_ip].clients.pop(device_id, None)
            
            # Clean up empty rooms to free memory
            if not self._rooms[room_ip].clients:
                del self._rooms[room_ip]

    # --- Room Lookups ---

    def get_room_for_device(self, device_id: str) -> str | None:
        """Return the public IP (room key) for a given device."""
        return self._client_room_map.get(device_id)

    def _get_devices_in_room(self, client_ip: str) -> list[DeviceInfo]:
        """Return the device list for a specific room (public IP).
        Crucial Rule: Only IDLE devices (active_chat_id is None) are exposed to scanners. 
        Busy users disappear to prevent interruption spam.
        """
        if client_ip in self._rooms:
            return [client.device_info for client in self._rooms[client_ip].clients.values() 
                    if client.device_info.active_chat_id is None]
        return []

    def _get_public_chats_in_room(self, client_ip: str) -> list[PublicChatSummary]:
        """Return a summary of all Public chats located in this room."""
        if client_ip not in self._rooms:
            return []
            
        public_summaries = []
        for chat_id, chat in self._chats.items():
            if chat.mode == ChatMode.PUBLIC:
                # To verify the chat is in this room, check where the admin is
                admin_ip = self._client_room_map.get(chat.admin_id)
                if admin_ip == client_ip:
                    # Resolve admin name for UX display
                    admin_client = self.get_client(chat.admin_id)
                    admin_name = admin_client.device_info.name if admin_client else "Unknown Admin"
                    
                    public_summaries.append(PublicChatSummary(
                        id=chat_id,
                        admin_name=admin_name,
                        participant_count=len(chat.participants)
                    ))
        return public_summaries

    def are_in_same_room(self, device_id_a: str, device_id_b: str) -> bool:
        """Check whether two devices belong to the same network room."""
        ip_a = self._client_room_map.get(device_id_a)
        ip_b = self._client_room_map.get(device_id_b)
        return ip_a is not None and ip_a == ip_b

    # --- Messaging ---

    async def broadcast_device_list(self, device_id: str | None = None) -> None:
        """Send the device list to all clients in the same room."""
        if device_id is not None:
            client_ip = self._client_room_map.get(device_id)
            if client_ip:
                await self._broadcast_to_room(client_ip)
        else:
            # Broadcast to every room
            for client_ip in list(self._rooms.keys()):
                await self._broadcast_to_room(client_ip)

    async def _broadcast_to_room(self, client_ip: str) -> None:
        """Send the current device list to all clients in one room."""
        if client_ip not in self._rooms:
            return
            
        devices = self._get_devices_in_room(client_ip)
        public_chats = self._get_public_chats_in_room(client_ip)
        message = DeviceListMessage(type="device-list", devices=devices, public_chats=public_chats)
        payload = message.model_dump_json()

        dead: list[str] = []
        # Iterate over a list of values to avoid dict size change errors during iteration
        for client in list(self._rooms[client_ip].clients.values()):
            try:
                await client.websocket.send_text(payload)
            except Exception:
                dead.append(client.device_info.id)

        for did in dead:
            self.disconnect(did)

    async def broadcast_device_list_to_room(self, client_ip: str) -> None:
        """Public method to broadcast device list to a specific room by IP."""
        await self._broadcast_to_room(client_ip)

    async def send_personal_message(self, message: str, target_id: str) -> bool:
        """Send a string payload to a specific connected device via its WebSocket."""
        client = self.get_client(target_id)
        if client:
            try:
                await client.websocket.send_text(message)
                return True
            except Exception:
                self.disconnect(target_id)
                ip = self._client_room_map.get(target_id)
                if ip:
                    await self._broadcast_to_room(ip)
        return False

    # --- Chat Management ---

    def create_chat(self, device_id_a: str, device_id_b: str) -> str | None:
        """Create a chat session between two devices if both exist. Devices leave any existing chat."""
        client_a = self.get_client(device_id_a)
        client_b = self.get_client(device_id_b)
        
        if not client_a or not client_b:
            return None

        # Both devices must be in the same network
        if not self.are_in_same_room(device_id_a, device_id_b):
            return None

        # Leave existing active chats if any
        self.leave_chat(device_id_a)
        self.leave_chat(device_id_b)

        chat_id = uuid.uuid4().hex[:12]
        # Device A acts as the initiator/admin of the newly formed chat by default
        self._chats[chat_id] = ChatSession(
            id=chat_id, 
            mode=ChatMode.PRIVATE, 
            admin_id=device_id_a, 
            participants=[device_id_a, device_id_b]
        )
        
        # Update devices with active chat tracking
        client_a.device_info.active_chat_id = chat_id
        client_b.device_info.active_chat_id = chat_id

        return chat_id

    def leave_chat(self, device_id: str) -> str | None:
        """Remove a device from its active chat. If chat becomes empty or invalid, clean it up.
        Returns the chat_id they left if applicable, otherwise None."""
        client = self.get_client(device_id)
        if not client or not client.device_info.active_chat_id:
            return None

        chat_id = client.device_info.active_chat_id
        chat = self._chats.get(chat_id)
        
        client.device_info.active_chat_id = None
        
        if chat:
            if device_id in chat.participants:
                chat.participants.remove(device_id)
            
            # If less than 2 people in the chat, the chat is considered dead
            if len(chat.participants) < 2:
                for p_id in chat.participants:
                    p_client = self.get_client(p_id)
                    if p_client:
                        p_client.device_info.active_chat_id = None
                del self._chats[chat_id]
        
        return chat_id

    def get_chat(self, chat_id: str) -> ChatSession | None:
        """Get an active chat session by ID."""
        return self._chats.get(chat_id)
