from typing import Optional
from pydantic import BaseModel
from enum import Enum


class ChatMode(str, Enum):
    PRIVATE = "private"
    PUBLIC = "public"


class DeviceInfo(BaseModel):
    """Represents a connected device."""
    id: str
    name: str
    active_chat_id: Optional[str] = None


class ChatSession(BaseModel):
    """Represents an active chat session."""
    id: str
    mode: ChatMode = ChatMode.PRIVATE
    admin_id: str
    participants: list[str]


class PublicChatSummary(BaseModel):
    """Represents a public chat info sent to idle devices for discovery."""
    id: str
    admin_name: str
    participant_count: int


class JoinMessage(BaseModel):
    """Message sent by a client when joining."""
    type: str  # "join"
    name: str


class NameChangeMessage(BaseModel):
    """Message sent by a client when changing their name."""
    type: str  # "name_change"
    name: str


class DeviceListMessage(BaseModel):
    """Broadcast message containing idle devices and open public chats."""
    type: str = "device-list"
    devices: list[DeviceInfo] # Note: Busy users are intentionally excluded
    public_chats: list[PublicChatSummary]
