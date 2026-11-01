import { ICE_SERVERS } from "@/lib/webrtc/ConnectionController"
import { CandidateKind, describeCandidate } from "./connection-log"
import { probeSyncAccessHandle } from "./storage-test"

export interface DeviceCapabilities {
  userAgent: string
  secureContext: boolean
  opfs: boolean
  syncAccessHandle: boolean
  createWritable: boolean
  saveFilePicker: boolean
  serviceWorker: boolean
  webShare: boolean
  wakeLock: boolean
  webLocks: boolean
  webRTC: boolean
  storagePersisted: boolean | null
  quotaBytes: number | null
  usageBytes: number | null
  iceCandidates: Partial<Record<CandidateKind, number>>
}

const ICE_PROBE_TIMEOUT_MS = 5000

async function probeIceCandidates() {
  const counts: Partial<Record<CandidateKind, number>> = {}
  if (typeof RTCPeerConnection === "undefined") return counts

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  pc.createDataChannel("probe")

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ICE_PROBE_TIMEOUT_MS)
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) {
          clearTimeout(timer)
          resolve()
          return
        }
        const kind = describeCandidate(candidate.candidate)
        counts[kind] = (counts[kind] ?? 0) + 1
      }
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(reject)
    })
  } finally {
    pc.close()
  }
  return counts
}

async function readStorageStatus() {
  if (!navigator.storage) return { persisted: null, quota: null, usage: null }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted?.().catch(() => null) ?? null,
    navigator.storage.estimate?.().catch(() => null) ?? null,
  ])
  return { persisted, quota: estimate?.quota ?? null, usage: estimate?.usage ?? null }
}

export async function readCapabilities(): Promise<DeviceCapabilities> {
  const opfs = typeof navigator.storage?.getDirectory === "function"
  const [storage, syncAccessHandle, iceCandidates] = await Promise.all([
    readStorageStatus(),
    opfs ? probeSyncAccessHandle() : Promise.resolve(false),
    probeIceCandidates().catch(() => ({})),
  ])

  return {
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    opfs,
    syncAccessHandle,
    createWritable:
      typeof FileSystemFileHandle !== "undefined" && "createWritable" in FileSystemFileHandle.prototype,
    saveFilePicker: "showSaveFilePicker" in window,
    serviceWorker: "serviceWorker" in navigator,
    webShare: typeof navigator.canShare === "function",
    wakeLock: "wakeLock" in navigator,
    webLocks: "locks" in navigator,
    webRTC: typeof RTCPeerConnection !== "undefined",
    storagePersisted: storage.persisted,
    quotaBytes: storage.quota,
    usageBytes: storage.usage,
    iceCandidates,
  }
}
