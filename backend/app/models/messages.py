from pydantic import BaseModel
from typing import Optional, Literal, Dict, Any

class BaseMessage(BaseModel):
    type: str
    from_id: Optional[str] = None
    to: Optional[str] = None

class RegisterMessage(BaseModel):
    type: Literal["register"]
    device_name: str

class ConnectRequestMsg(BaseModel):
    type: Literal["connect_request"]
    from_id: str
    to: str

class ConnectResponseMsg(BaseModel):
    type: Literal["connect_accept", "connect_reject"]
    from_id: str
    to: str

class SDPMessage(BaseModel):
    type: Literal["sdp_offer", "sdp_answer"]
    from_id: str
    to: str
    sdp: dict

class ICEMessage(BaseModel):
    type: Literal["ice_candidate"]
    from_id: str
    to: str
    candidate: dict
