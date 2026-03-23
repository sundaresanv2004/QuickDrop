import asyncio
import json
import websockets

async def test_websocket():
    url = "ws://localhost:8000/ws/connect"
    
    # 1. Connect Device A
    ws_a = await websockets.connect(url)
    welcome_a = json.loads(await ws_a.recv())
    print("Device A Welcome:", welcome_a)
    assert welcome_a["type"] == "welcome"
    device_id_a = welcome_a["device_id"]
    
    peer_list_a = json.loads(await ws_a.recv())
    print("Device A Peer List:", peer_list_a)
    assert peer_list_a["type"] == "peer_list"
    assert len(peer_list_a["peers"]) == 0
    
    await ws_a.send(json.dumps({"type": "register", "device_name": "Test Device A"}))
    
    # 2. Connect Device B
    ws_b = await websockets.connect(url)
    welcome_b = json.loads(await ws_b.recv())
    print("Device B Welcome:", welcome_b)
    device_id_b = welcome_b["device_id"]
    
    peer_list_b = json.loads(await ws_b.recv())
    print("Device B Peer List:", peer_list_b)
    assert len(peer_list_b["peers"]) == 1
    assert peer_list_b["peers"][0]["device_id"] == device_id_a
    
    await ws_b.send(json.dumps({"type": "register", "device_name": "Test Device B"}))
    
    # Device A should receive peer_joined
    joined_a = json.loads(await ws_a.recv())
    print("Device A received joined:", joined_a)
    assert joined_a["type"] == "peer_joined"
    assert joined_a["device_id"] == device_id_b
    
    # 4. Device A sends connect_request to Device B
    await ws_a.send(json.dumps({
        "type": "connect_request",
        "to": device_id_b
    }))
    
    # Device B should receive connect_request
    req_b = json.loads(await ws_b.recv())
    print("Device B received request:", req_b)
    assert req_b["type"] == "connect_request"
    assert req_b["from_id"] == device_id_a
    
    # 3. Close Device B
    await ws_b.close()
    
    # Device A should receive peer_left
    left_a = json.loads(await ws_a.recv())
    print("Device A received left:", left_a)
    assert left_a["type"] == "peer_left"
    assert left_a["device_id"] == device_id_b
    
    await ws_a.close()
    print("All 4 checks passed!")

asyncio.run(test_websocket())
