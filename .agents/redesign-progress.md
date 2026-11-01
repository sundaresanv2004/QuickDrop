# QuickDrop Redesign: Progress Tracker

The single source of truth for the architecture redesign. Update it whenever a phase changes status, a decision is made, or a field test reports back. For backlog items outside the redesign, see [`todo.md`](./todo.md).

**Branch:** `architecture-redesign`

## Goal

Send files up to 5 GB directly between nearby devices, including iPhones, without lag or crashes. If an iPhone can't handle 5 GB, the app shows its real limit, and 5 GB still applies elsewhere. Automatic discovery, Accept/Reject, and direct WebRTC chat and files stay as they are.

## Status

| Phase | Purpose | Status | Commit |
|---|---|---|---|
| 0. Diagnostics | Find out what iPhones can handle | Tools done, **iPhone results missing** | `ddd2f67`, `363039e`, `a6d14f6` |
| 1. Connection reliability | Keep connections alive, explain failures | Built, **not tested on real devices** | `8e61020` |
| 2. Discovery fallback | Connect devices that can't find each other | Built, **not tested on real devices** | `3a42993` |
| 3. Transfer engine | Send large files without lag | Not started | |
| 4. Storage and saving | Store large files without crashing | Not started, iPhone save method depends on Phase 0 | |
| 5. UI and mobile | Clear, smooth transfers on phones | Not started | |

**Next step:** the owner deploys and field-tests Phases 0 to 2. Then record the results below and start Phase 3 once they confirm.

## Waiting on the owner

Nothing here has been confirmed yet:

- [ ] Set `TRUSTED_PROXY_HEADER` for production (see the README). The production proxy setup hasn't been confirmed.
- [ ] Confirm the Docker build works. Docker has never been run during this work, and Vitest needs Node 22.12+ while the Dockerfile uses Node 20. That should only be an install warning, since tests don't run in Docker.
- [ ] Do devices on the same Wi-Fi appear automatically?
- [ ] Does an iPhone with Private Relay on appear? If not, does the QR code connect it?
- [ ] Does the iPhone camera open the link from a real QR code?
- [ ] Does turning Wi-Fi off and on during a chat show "Reconnecting…" and recover?
- [ ] Can two iPhones connect to each other? See the risk under Findings.
- [ ] Paste the **Copy report** result from `/health` on an iPhone: disk tests at 1, 3, and 5 GB, each save method, and the Photos and Files picker tests.

## Field test results

None yet. Record the date, devices, what was tested, and the outcome here.

## Decisions

- **Stack:** Next.js and FastAPI stay. The transfer, connection, and discovery layers are what's being redesigned.
- **Limit:** 5 GiB, as one `MAX_FILE_BYTES` constant checked by both sender and receiver.
- **HTTPS only:** the public HTTPS site is the target. Plain HTTP on a LAN isn't supported for large transfers, because browsers disable the required features.
- **Direct connections only:** no TURN and no file data through the server. Networks that block direct connections show a clear error.
- **Discovery:** automatic public-IP rooms stay the default. A QR code or link is an optional fallback, with a single-use token that lasts 5 minutes. Accept/Reject always applies.
- **Multiple files:** sent one at a time, with no ZIP creation, which is an iOS memory risk.
- **Large files need acceptance:** files of 100 MB or more require an explicit Accept.
- **No camera permission:** QuickDrop won't request it to expose local addresses, even though one similar project does.

**Out of scope:** TURN or any relay, native apps, and resuming after the sender reloads.

**Known issue for separate work:** the link preview endpoint can be pointed at internal addresses (SSRF), and URLs typed in chat reach the server, which conflicts with the README's privacy claim.

## Findings to remember

- **Other projects:** PairDrop stores files in memory and rejects iOS transfers of 200 MB or more, so 5 GB requires writing to disk as data arrives.
- **Private windows:** storage is very limited. Chromium ran out at about 956 MB in a Playwright context, which behaves like Incognito, and WebKit failed before writing anything. The app must detect this and explain it.
- **Failed writes can look normal:** Chromium's `write()` can report a full disk by returning `4294967288` (`-8` as unsigned) instead of throwing. Always compare the returned byte count.
- **Service Worker downloads:** `<a download>` from a page outside the worker's scope skips the worker. Navigating a hidden iframe into the scope works. Reports conflict on whether real iOS streams these to disk.
- **Desktop results:** Chromium and desktop WebKit both wrote, verified, and saved 5 GiB intact using a download link and a Service Worker stream. This says nothing about iPhone memory limits.
- **iPhone-to-iPhone risk:** two WebKit browsers can't connect in Playwright's build, even with plain WebRTC and no QuickDrop code, because neither resolves the other's mDNS address. This may only be a limit of that build, so it needs testing on real devices. WebKit to Chromium connects fine.
- **Reconnect timing:** a device that vanishes stays visible for up to about 70 seconds: up to 40 to detect it, plus the 30-second reconnect window. A normal reload or page close is noticed almost immediately. Pages kept in the back/forward cache can take the longer path.

## What's built

### Phase 0: Diagnostics
- `/health` has a device diagnostics section: `components/diagnostics/DiagnosticsPanel.tsx` and `lib/diagnostics/`.
- It tests capabilities, disk storage, save methods, saved-file integrity, and file pickers, and it logs connection details without IP addresses.
- `public/diagnostics-sw.js` is a test-only Service Worker, limited to `/__diagnostics/`.
- **Exit gate:** the iPhone report sets the iOS save method and size limit.

### Phase 1: Connection reliability
- `lib/webrtc/ConnectionWatchdog.ts` handles grace periods, ICE restarts, and timeouts. A failed connection explains the likely cause through `explainConnectionFailure` in `lib/diagnostics/connection-log.ts`.
- There's one offerer in every case. If both devices request each other, the higher ID accepts and the lower ID offers. Only the original offerer restarts ICE.
- `connected` requires all three data channels to be open. There's a new `reconnecting` status.
- Device sessions resume for 30 seconds using a secret kept in `sessionStorage`, in `lib/webrtc/SignalingClient.ts` and `backend/app/ws/route.py`.
- The first WebSocket message must be `register`. Signaling sent to an offline device is queued, up to 64 messages.
- Not tested: a real network loss, which the tests simulate, and transfers during a drop.

### Phase 2: Discovery fallback
- `components/discovery/ConnectAnotherWayDialog.tsx` and `lib/pair-link.ts`. The token lives in the URL fragment, so it stays out of server logs.
- `connection_manager.py` holds pairing tokens and links. Messages are only relayed within a room or between linked devices, and an accepted request also creates a link so signaling survives a network change.
- `resolve_client_ip` trusts only the header named by `TRUSTED_PROXY_HEADER`.

## Remaining work

### Phase 3: Transfer engine
New code in `frontend/lib/transfer/` replaces `lib/webrtc/FileTransferManager.ts`. This is what removes the current 250 MB limit, together with Phase 4.

- `protocol.ts`: versioned messages, and binary frames tagged with transfer ID and byte offset.
- `SendSession.ts` and `read.worker.ts`: read 1 MiB blocks in a worker, calculate CRC32, and send up to 64 KB per message, limited by `pc.sctp.maxMessageSize`.
- `ReceiveSession.ts` and `storage.worker.ts`: batch data, transfer it to a worker, write it by offset, and verify checksums.
- Flow control: the sender needs credit from bytes the receiver has **written to disk**, and must also respect `bufferedAmount`. Start at 16 MiB on desktop and 4 MiB on mobile, then tune from testing.
- Resume: after a drop, the receiver reports its verified offset and the sender continues from there, as long as both pages stay alive.

### Phase 4: Storage and saving
New code in `frontend/lib/transfer/storage/`.

- Chromium desktop: `showSaveFilePicker` from the Accept click, writing directly to that file.
- Other browsers: an OPFS sync access handle in a dedicated worker, then the save method chosen by the Phase 0 report.
- Check space with `navigator.storage.estimate()` before accepting, allowing about twice the file size where saving makes a second copy.
- Call `navigator.storage.persist()`. Stop clearing data on `pagehide`, because that could erase a transfer that can still resume.
- Delete files after saving or on leaving the session, and sweep old files on startup. Use Web Locks to protect files another tab is using.
- Delete `IndexedDBManager.ts` and the dead `streamingMode` and `acceptLargeFileStream` paths once the new engine works.

### Phase 5: UI and mobile
- A `TransferStore` read with `useSyncExternalStore`, updating at most 4 times per second, so only the active file bubble re-renders.
- Show speed and time remaining, and states for waiting, paused, reconnecting, verifying, ready to save, and saved, in `FileBubble.tsx` and `FileProgressBar.tsx`.
- Explicit acceptance for files of 100 MB or more.
- Screen Wake Lock where available, a warning before leaving during a transfer, and guidance for iPhone users to keep QuickDrop open and in front.
- Make the iPhone save action a direct tap, as required by the chosen save method.
- Recommend Files over Photos for large iPhone videos if Phase 0 shows Photos processes them first.
- Add `media-src blob:` to `next.config.mjs`, and allow Service Workers only if Phase 0 selects them.
- Update `README.md` and `todo.md` to match what ships.

### Done means
- File hashes match and the receiver's memory stays roughly flat.
- The page stays usable during a transfer.
- A short network drop resumes without restarting at zero.
- Any iPhone limit is documented and shown in the app.

Final real-device checks, with hashes verified each time:

| Sender → receiver | Sizes | Also test |
|---|---|---|
| iPhone → desktop | 1, 3, 5 GB | Private Relay on and off |
| Desktop → iPhone | 1, 3, 5 GB | Lock and background, then resume |
| Android ↔ desktop | 1, 5 GB | Chat stays responsive |
| iPhone ↔ Android | 1 GB | QR fallback |
| Desktop ↔ desktop | 5 GB | Compare memory use with the old build |
