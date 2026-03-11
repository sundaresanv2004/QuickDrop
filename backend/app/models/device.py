from typing import Optional
from pydantic import BaseModel


class DeviceInfo(BaseModel):
    """Represents a connected device."""
    id: str
    name: str
    active_chat_id: Optional[str] = None


class ChatSession(BaseModel):
    """Represents an active chat session."""
    id: str
    participants: list[str]


class JoinMessage(BaseModel):
    """Message sent by a client when joining."""
    type: str  # "join"
    name: str


class NameChangeMessage(BaseModel):
    """Message sent by a client when changing their name."""
    type: str  # "name_change"
    name: str


class DeviceListMessage(BaseModel):
    """Broadcast message containing all connected devices."""
    type: str = "device-list"
    devices: list[DeviceInfo]
