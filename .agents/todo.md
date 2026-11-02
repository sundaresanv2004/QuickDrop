# QuickDrop — Todo & Improvement Tracker

This file tracks what currently exists in the project, what needs to be improved, and what still needs to be built. Every item will be broken into small sub-parts and implemented step by step with explicit user confirmation before each step.

---

## ✅ What Currently Exists

### Backend
- [x] FastAPI WebSocket signaling server
- [x] Public IP-based device discovery & room grouping
- [x] IPv6 `/64` prefix normalization
- [x] Device registration (`register` message)
- [x] Peer list broadcasting (`peer_list`, `peer_joined`, `peer_left`, `peer_updated`)
- [x] Connect request relay (`connect_request`, `connect_accept`, `connect_reject`, `connect_cancel`)
- [x] WebRTC SDP Offer/Answer relay
- [x] ICE Candidate relay
- [x] Busy status broadcasting (`update_status`)
- [x] CORS configuration
- [x] Docker + Docker Compose setup

### Frontend
- [x] Next.js 16 App Router setup with Tailwind CSS v4
- [x] WebSocket connection with auto-reconnect
- [x] Device auto-registration with name & type detection
- [x] Discovery page — devices appear automatically on screen
- [x] Peer bubbles with device icons
- [x] Device name editing
- [x] Requesting modal (waiting for acceptance)
- [x] Incoming request modal (Accept / Reject)
- [x] WebRTC peer connection management (`WebRTCManager.ts`)
- [x] Three DataChannels: `chat`, `files`, `system`
- [x] Text message sending & receiving
- [x] Emoji reactions on messages
- [x] Typing indicators
- [x] File transfer with chunked sending & flow control
- [x] Files up to 5 GB, with explicit approval from 100 MB
- [x] Received files written to disk as they arrive
- [x] File download and sharing from disk
- [x] Busy status (hides device from peers when in session)
- [x] Chat page with routing (`/chat/[peerId]`)
- [x] Error & not-found pages

---

## 🔧 What Needs to Be Improved

### Backend
- [x] **Heartbeat / Ping-Pong:** Detect and clean up "ghost" devices (browsers that closed without a clean disconnect) by implementing a periodic ping/pong check.
- [x] **Rate limiting:** Prevent abuse by limiting WebSocket connections and `connect_request` messages per IP.
- [x] **Reconnecting sessions:** A dropped device keeps its identity for 30 seconds, and signaling sent meanwhile is delivered when it returns.
- [x] **Relay limits:** Targeted messages only reach devices in the same room or linked by a QR code, a link, or an accepted request.
- [x] **Trusted proxy header:** Only the header named by `TRUSTED_PROXY_HEADER` can set a device's IP.

### Frontend — Discovery
- [x] **Device type detection:** Improve accuracy of detecting device type (mobile, tablet, desktop, laptop) from the user agent.
- [x] **Empty state UX:** Improve the empty state shown when no peers are found (clearer messaging, animation).
- [x] **Peer bubble animations:** Refine the "device appears" animation when a new peer joins.
- [x] **Connect another way:** QR code or link for devices that automatic discovery can't find.

### Frontend — Handshake
- [x] **Accept / Reject consent flow:** The incoming request modal IS the verification step. Device B must explicitly accept before any connection is established. No codes needed — consent is the security boundary.

### Frontend — Chat
- [ ] **Link previews:** Implement unfurling of URLs shared in chat messages.
- [ ] **Image preview in chat:** Show inline thumbnail previews for shared image files.
- [ ] **Video preview in chat:** Show inline playable video for shared video files.
- [ ] **File type icons:** Show distinct icons for different file types (PDF, ZIP, etc.).
- [ ] **Copy message text:** Allow long-pressing or right-clicking a text message to copy it.
- [ ] **Session persistence on reload:** Handle the case where the chat page is reloaded mid-session gracefully.

### Frontend — General / UX
- [ ] **Dark/Light theme toggle:** Add a visible toggle for theme switching.
- [ ] **Mobile responsiveness:** Audit and improve the layout on small screen sizes.
- [ ] **Connection lost handling:** Show a clear, user-friendly screen when the WebSocket or WebRTC connection drops unexpectedly.
- [ ] **Onboarding / First-time experience:** Add a subtle first-visit guide explaining how discovery works.

---

## 🆕 What Still Needs to Be Built

- [ ] **Transfer history (in-session):** A scrollable log of all files transferred in the current session with status indicators.
- [x] **Multi-file send:** Allow users to select and send multiple files at once.
- [x] **Drag & drop file sending:** Drop files directly onto the chat window to send them.
- [ ] **Clipboard paste to send:** Paste an image from clipboard directly into the chat to send it.
- [ ] **"Leave session" confirmation:** A proper confirmation dialog before ending a session.
