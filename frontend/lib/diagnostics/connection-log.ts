// Keeps a summary of the latest WebRTC attempt so the health page can show it
// after the chat page has closed. It stores candidate types, never addresses.

export type CandidateKind = "host-mdns" | "host-ip" | "srflx" | "prflx" | "relay" | "unknown"

export interface ConnectionLog {
  role: "initiator" | "responder"
  startedAt: number
  connectedAfterMs: number | null
  states: string[]
  localCandidates: Partial<Record<CandidateKind, number>>
  remoteCandidates: Partial<Record<CandidateKind, number>>
  selectedPair: { local: string; remote: string; protocol: string } | null
  maxMessageSize: number | null
  iceRestarts: number
}

const STORAGE_KEY = "quickdrop_diag_connection"

export function createConnectionLog(role: ConnectionLog["role"]): ConnectionLog {
  return {
    role,
    startedAt: Date.now(),
    connectedAfterMs: null,
    states: [],
    localCandidates: {},
    remoteCandidates: {},
    selectedPair: null,
    maxMessageSize: null,
    iceRestarts: 0,
  }
}

// ICE candidate grammar: foundation component protocol priority address port "typ" type ...
export function describeCandidate(candidate?: string | null): CandidateKind {
  const parts = candidate?.trim().split(/\s+/) ?? []
  const typeIndex = parts.indexOf("typ")
  const type = typeIndex === -1 ? undefined : parts[typeIndex + 1]

  switch (type) {
    case "host":
      return parts[4]?.endsWith(".local") ? "host-mdns" : "host-ip"
    case "srflx":
    case "prflx":
    case "relay":
      return type
    default:
      return "unknown"
  }
}

function hasCandidates(candidates: ConnectionLog["localCandidates"]) {
  return Object.keys(candidates).length > 0
}

export function explainConnectionFailure(log: ConnectionLog | null): string {
  if (!log) return "The other device didn't respond. Ask them to reopen QuickDrop and try again."
  if (!hasCandidates(log.localCandidates)) {
    return "This device couldn't find a network route. Check your Wi-Fi and turn off any VPN, then try again."
  }
  if (!hasCandidates(log.remoteCandidates)) {
    return "The other device didn't respond. It may have gone offline or closed QuickDrop."
  }
  return "Both devices responded but couldn't reach each other directly. Check that they're on the same Wi-Fi. Guest networks often block devices from connecting to each other."
}

export function saveConnectionLog(log: ConnectionLog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log))
  } catch {
    // Diagnostics must never affect a real connection.
  }
}

export function loadConnectionLog(): ConnectionLog | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ConnectionLog) : null
  } catch {
    return null
  }
}
