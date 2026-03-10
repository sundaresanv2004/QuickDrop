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

---

## License

MIT License
