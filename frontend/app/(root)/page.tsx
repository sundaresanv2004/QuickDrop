"use client"

import { useWebRTC } from "@/context/WebRTCContext"
import StatusBar from "@/components/discovery/StatusBar"
import PeerBubble from "@/components/discovery/PeerBubble"
import EmptyState from "@/components/discovery/EmptyState"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon } from "@hugeicons/core-free-icons"

export default function DiscoveryPage() {
  const { isConnected, deviceId, deviceName, peers } = useWebRTC()

  const handlePeerClick = (peerId: string) => {
    console.log("Clicked peer:", peerId)
    // TODO: Phase 2 - send connect_request here
  }

  return (
    <main className="flex flex-col items-center min-h-svh bg-background text-foreground selection:bg-primary/20">
      <StatusBar isConnected={isConnected} appName={process.env.NEXT_PUBLIC_APP_NAME || "QuickDrop"} />

      {/* Peer grid area */}
      <div className="flex-1 w-full max-w-5xl flex items-center justify-center px-6 py-12">
        {peers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-12 animate-in fade-in duration-500">
            {peers.map(peer => (
              <PeerBubble key={peer.device_id} peer={peer} onClick={handlePeerClick} />
            ))}
          </div>
        )}
      </div>

      {/* My Device Bubble — always visible at bottom */}
      <div className="pb-10 pt-6">
        <div className="flex flex-col items-center gap-3 opacity-70 hover:opacity-100 transition-opacity duration-300">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/5 blur-md" />
            <div className="relative w-20 h-20 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center border border-border/40 shadow-md">
              <HugeiconsIcon icon={ComputerIcon} className="w-8 h-8 text-foreground/50" />
            </div>
          </div>
          <span className="text-sm font-medium text-foreground/60 w-40 text-center truncate">
            {deviceId ? `${deviceName} (You)` : "Connecting..."}
          </span>
        </div>
      </div>
    </main>
  )
}
