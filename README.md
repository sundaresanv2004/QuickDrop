# QuickDrop

QuickDrop is a **peer-to-peer local network communication and file sharing web application** that allows devices connected to the same network to discover each other and exchange messages or files instantly.

The goal of QuickDrop is to enable **fast, serverless communication between nearby devices** using modern web technologies such as **WebRTC and WebSockets**.

Unlike traditional chat or file transfer platforms, QuickDrop **does not store any messages or files on a server**. All data transfers happen **directly between devices** over the local network, ensuring speed, privacy, and temporary communication.

The backend server is used only for **device discovery and WebRTC signaling**, while the actual data transfer is handled **peer-to-peer between browsers**.

---

## Features

* Local network device discovery
* Peer-to-peer messaging
* Instant file sharing between devices
* Image and video transfer
* Accept / reject connection requests
* Temporary chat sessions (no stored messages)
* Public local network chat
* Private device-to-device chat
* Invite nearby devices to join a chat

All communication is **ephemeral and stays within the local network**.

---

## Architecture

QuickDrop follows a **hybrid peer-to-peer architecture**.

### Frontend (Next.js)

* User interface
* Device discovery interface
* WebRTC peer connection management
* File and message transfer via WebRTC DataChannels

### Backend (FastAPI)

* WebSocket signaling server
* Device registration
* Connection request handling
* WebRTC offer/answer exchange

The backend **never handles actual messages or files**.

All chat messages and file transfers occur **directly between devices using WebRTC**.

### Finding devices

Devices sharing a public IP address appear automatically. Discovery can miss a device using iCloud Private Relay, a VPN, or a different IP version, so **Connect another way** offers a QR code or link instead. Each one works once and expires after 5 minutes. It only makes the two devices visible to each other, and nothing is shared until one sends a request and the other accepts.

---

## Deployment

### Required: set `TRUSTED_PROXY_HEADER` behind a proxy

Discovery depends on the backend seeing each device's real IP address. Behind a proxy, set `TRUSTED_PROXY_HEADER` to the header your proxy sets. **If it's missing, every device reaches the backend from the proxy's address, so everyone using the site lands in one room and can see each other's device names.**

| In front of the backend | Value |
|---|---|
| Cloudflare | `cf-connecting-ip` |
| nginx with `proxy_set_header X-Real-IP $remote_addr` | `x-real-ip` |
| One proxy appending to `X-Forwarded-For` | `x-forwarded-for` |
| Nothing | Leave it unset |

The named header must be one your proxy always overwrites, and clients must not be able to reach the backend without going through that proxy. Otherwise a client can forge its network. The backend logs a warning if it sees proxy headers while this setting is empty.

To confirm it works, open `/health` on two devices. Those on the same Wi-Fi should show the same room code, and a phone on mobile data should show a different one.

### Recommended: an IPv4-only signaling hostname

A network can give one device an IPv4 connection and another an IPv6 connection, which puts them in separate rooms. Giving the backend hostname only an `A` record, with no `AAAA` record, keeps them together.

### Other settings

- **HTTPS:** required. Browsers disable the storage and security features QuickDrop needs on plain HTTP.
- **`CORS_ALLOWED_ORIGINS`:** comma-separated list of frontend origins, if yours isn't already allowed in `backend/app/main.py`.
- **`NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_API_URL`:** set at build time. Deploy the frontend and backend together.
- **One backend instance:** rooms, sessions, and links are held in memory, so don't run several instances behind a load balancer.

QuickDrop only connects devices directly and has no relay. Networks that block devices from reaching each other, such as guest Wi-Fi, will show a connection error.

---

## License

MIT License
