# QuickDrop

A browser-based AirDrop alternative. Devices on the same network discover each other, one sends a request, the other accepts, and they chat and share files directly over WebRTC. The server only handles discovery and signaling.

@.agents/AGENTS.md

## Current work

An architecture redesign is in progress on the `architecture-redesign` branch. Its status, decisions, findings, and remaining work are below, so start from there rather than asking the owner to explain it again.

@.agents/redesign-progress.md

## Working with the owner

- Work one phase at a time, and confirm before starting the next one.
- Don't commit or push unless asked. The owner usually commits and deploys themselves.
- Update `.agents/redesign-progress.md` when a phase changes status, a decision is made, or a field test reports back.
- Keep the UI polished when adding features. Match the existing components, and check phone and desktop sizes in light and dark mode.
- Say plainly what hasn't been tested. Desktop results don't prove iPhone behavior.

## Layout

- `backend/app/ws/route.py`: WebSocket signaling, sessions, and pairing.
- `backend/app/services/connection_manager.py`: devices, rooms, links, and pairing tokens.
- `frontend/lib/webrtc/`: `WebRTCManager` coordinates signaling, connection, chat, and file classes.
- `frontend/hooks/useWebRTCBridge.ts`: turns manager events into React state.
- `frontend/app/(root)/page.tsx`: discovery page. `frontend/app/chat/[peerId]/page.tsx`: chat page. `frontend/app/(root)/health/page.tsx`: server health and device diagnostics.

## Commands

Backend, from `backend/`:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --reload
```

```bash
uv run pytest -q
```

Frontend, from `frontend/`:

```bash
npm run dev
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run test:e2e
```

## Testing notes

- Run `npm run build` before `npm run test:e2e`. The browser tests use the production build, because the security policy and Service Worker behave differently in development.
- The tests start the frontend on port 3001, which the backend's CORS list allows, and a test backend on port 8010. They reuse a backend already running on port 8000, so that one must be running current code. Port 3001 must be free.
- Test devices use unique names and addresses, so they can't send requests to real devices, but they can briefly appear in QuickDrop tabs connected to port 8000.
- `E2E_SIZE_GIB=5 npx playwright test -g 'normal window'` runs the 5 GiB save test.
- Playwright contexts behave like private windows, so storage tests use a persistent profile.
- In WebKit runs, the other device is Chromium. Two WebKit peers can't connect in Playwright's build.
- `eslint` reports older errors in `FileTransferManager.ts`, `WebRTCManager.ts`, `useWebRTCBridge.ts`, and the chat page. New code shouldn't add to them.
