# QuickDrop Backend

WebSocket signaling and device discovery server for QuickDrop.

## Setup

```bash
# Install dependencies
uv sync

# Run the dev server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

| Endpoint  | Type      | Description          |
| --------- | --------- | -------------------- |
| `/health` | GET       | Health check         |
| `/ws`     | WebSocket | Device signaling hub |

## WebSocket Protocol

### Connect

Send a join message after connecting:

```json
{ "type": "join", "name": "My MacBook" }
```

### Receive

The server broadcasts the device list whenever a device joins or leaves:

```json
{
  "type": "device-list",
  "devices": [
    { "id": "a1b2c3d4", "name": "My MacBook" },
    { "id": "e5f6g7h8", "name": "iPhone" }
  ]
}
```
