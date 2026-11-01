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
