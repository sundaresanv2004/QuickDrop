# QuickDrop Project Rules & Context

## Project Vision & Goal
QuickDrop is a web-based "Quick Share" / "AirDrop" alternative designed around a chat-like interface. 
Unlike traditional file-sharing tools, QuickDrop enables devices on the same local network to discover each other automatically, with zero friction, entirely within the web browser.

**Core User Flow:**
1. **Magic Discovery:** A user opens the website. The application immediately identifies and displays all available devices on the local network.
2. **Session Initiation:** A user taps on a discovered device to send a connection request.
3. **Explicit Consent (Security Boundary):** The receiving device gets an incoming request prompt. The user must explicitly hit **Accept** or **Reject**. This step is the core security mechanism that prevents unauthorized sharing and protects against the inherent privacy risks of public IP-based discovery (e.g., in coffee shops).
4. **Chat & Share:** A dedicated, secure WebRTC chat area opens between the two devices. Within this session, users can exchange text messages, share photos, images, and any types of files seamlessly at local network speeds.

---

## Confirmed Architecture

### Layer 1 — Discovery (The Server's Only Job)
*   **Method:** Public IP Matching.
*   **How it works:** When a browser connects to the WebSocket server, the server reads its public IP and groups it into a "room" with all other connected browsers sharing that same IP.
*   **Security mitigation:** The **Accept / Reject** modal on the receiving device. No PIN. No room code. Consent is the security layer.
*   **IPv6 handling:** Group by the `/64` prefix so all devices on the same local network (which share a prefix) land in the same room even on IPv6.

### Layer 2 — Signaling (WebSocket Handshake)
This layer only exists to help two browsers "find" each other. Once done, it steps aside.
1. **Connect:** Browser opens a WebSocket to the FastAPI server and sends its device name & type.
2. **Discover:** Server sends back the list of all peers in the same IP room.
3. **Request:** Device A clicks on Device B → server relays a `connect_request` message.
4. **Consent:** Device B sees the modal → hits Accept or Reject → server relays the response.
5. **Handshake:** Server relays the WebRTC **SDP Offer / Answer** and **ICE Candidates** between the two browsers.
6. **Done:** Server is now completely out of the picture.

### Layer 3 — Data Transfer (WebRTC, 100% P2P)
Once the handshake completes, all data flows **directly browser-to-browser**. The server never sees a single byte of content.
*   **Text messages:** WebRTC DataChannel (`chat` channel).
*   **File transfers:** WebRTC DataChannel (`files` channel), chunked with flow control.
*   **System signals:** WebRTC DataChannel (`system` channel, for typing indicators, file metadata, etc.).
*   **Encryption:** WebRTC enforces **DTLS encryption** on all DataChannels by default.

### Layer 4 — Technology Stack
*   **Frontend:** Next.js 16 (App Router) + React 19 (Modern, fast, easy to self-host).
*   **Styling:** Tailwind CSS v4 (Utility-first, clean output).
*   **UI Components:** Radix UI / shadcn-style (Accessible, composable primitives).
*   **Backend:** FastAPI (Python) (Lightweight, async, WebSocket-native).
*   **Runtime:** Uvicorn (ASGI server for FastAPI).
*   **Package Manager:** `uv` (Fast, modern alternative to pip).
*   **Deployment:** Docker + Docker Compose (Self-hostable, portable).

---

## Agent Instructions
- **Preserve the Magic:** Never suggest adding PINs, Room Codes, or manual IP entry for the primary discovery flow. The goal is automatic, zero-friction discovery using IP matching.
- **Rely on Consent for Security:** The Accept/Reject modal is the primary defense against spam and accidental connections. Ensure this flow remains robust.
- **Peer-to-Peer First:** Always prioritize WebRTC direct connections. Keep the backend as "dumb" and lightweight as possible. It should only handle signaling, never data proxying.
- **Backend Constraints:** The backend must never store any messages or files, see file contents, or proxy file data. It strictly groups devices and relays WebRTC signaling.
- **Premium Aesthetics:** The user interface should feel native, modern, intuitive, and highly responsive. Avoid generic designs.
- **Task Tracking:** Before starting any new feature or improvement, always read [`.agents/todo.md`](./todo.md). This file is the single source of truth for what exists, what needs improvement, and what still needs to be built. Work must be done step by step — one item at a time — only after explicit user confirmation to proceed.
