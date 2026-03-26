"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"

export default function ChatPage() {
  const router  = useRouter()
  const params  = useParams()
  const peerId  = params.peerId as string

  const {
    connectionStatus,
    targetPeerId,
    peers,
    myDeviceName,
    chatChannel,
    resetConnection,
  } = useWebRTC()

  // ─── Guard: redirect back if no active connection ───
  useEffect(() => {
    if (
      connectionStatus !== "connected" &&
      connectionStatus !== "connecting"
    ) {
      console.warn("[CHAT PAGE] No active connection — redirecting to /")
      router.replace("/")
    }
  }, [connectionStatus, router])

  // ─── Derive peer name from peers list ───
  const peerName =
    peers.find(p => p.device_id === peerId)?.device_name ?? "Unknown Device"

  const handleLeave = () => {
    resetConnection()
    router.replace("/")
  }

  // ─── Render ───
  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={handleLeave}>
          ← Back
        </button>
        <div className="flex flex-col items-center">
          <span className="font-semibold">{peerName}</span>
          <span className="text-xs text-muted-foreground">{peerId}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${
            connectionStatus === "connected" ? "bg-green-500" : "bg-yellow-500"
          }`} />
          <span className="text-xs capitalize">{connectionStatus}</span>
        </div>
      </header>

      {/* Body — placeholder until Phase 4 */}
      <main className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-center space-y-2">
          <p className="text-2xl">🎉</p>
          <p className="font-semibold text-lg">P2P Connection Established</p>
          <p className="text-muted-foreground text-sm">
            Connected to {peerName} via WebRTC DataChannel
          </p>
          <p className="text-muted-foreground text-sm">
            Chat UI coming in Phase 4
          </p>
        </div>

        {/* DataChannel status panel */}
        <div className="border rounded-lg p-4 text-sm font-mono space-y-1 w-80">
          <p className="font-semibold mb-2 text-center">DataChannel Status</p>
          <p>chat:   {chatChannel?.readyState ?? "—"}</p>
          <p>Your device: {myDeviceName}</p>
          <p>Connection:   {connectionStatus}</p>
        </div>
      </main>

    </div>
  )
}
