from fastapi import APIRouter
from app.websockets.endpoints.ws import manager

router = APIRouter()

@router.get("/debug/state", tags=["Debug"])
async def get_debug_state():
    """Debug endpoint to dump the entire ConnectionManager state."""
    
    # Serialize Rooms & Clients
    rooms_data = {}
    for ip, room in manager._rooms.items():
        rooms_data[ip] = [client.device_info.model_dump() for client in room.clients.values()]
        
    # Serialize Chats
    chats_data = {chat_id: chat.model_dump() for chat_id, chat in manager._chats.items()}
    
    return {
        "rooms": rooms_data,
        "chats": chats_data,
        "total_rooms": len(manager._rooms),
        "total_active_chats": len(manager._chats)
    }
