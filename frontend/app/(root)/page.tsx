"use client"

import { useWebRTC } from "@/context/WebRTCContext"
import StatusBar from "@/components/discovery/StatusBar"
import PeerBubble from "@/components/discovery/PeerBubble"
import EmptyState from "@/components/discovery/EmptyState"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon } from "@hugeicons/core-free-icons"

/**
 * Compute radial positions for peers orbiting around center.
 * Peers are placed in a circle with staggered radii for a natural feel.
 */
function getOrbitalStyle(index: number, total: number): React.CSSProperties {
  const baseRadius = Math.min(180, 120 + total * 20);
  // offset radius slightly for odd indices to stagger the orbit
  const radius = index % 2 === 0 ? baseRadius : baseRadius * 0.75;
  // evenly distribute, with a slight random-ish offset for organic feel
  const angleStep = (2 * Math.PI) / total;
  const startAngle = -Math.PI / 2; // top
  const angle = startAngle + index * angleStep;

  return {
    position: "absolute" as const,
    left: `calc(50% + ${Math.cos(angle) * radius}px - 3.5rem)`,
    top: `calc(50% + ${Math.sin(angle) * radius}px - 3.5rem)`,
    animationDelay: `${index * 80}ms`,
  };
}

export default function DiscoveryPage() {
  const { isConnected, deviceId, deviceName, peers } = useWebRTC()

  const handlePeerClick = (peerId: string) => {
    console.log("Clicked peer:", peerId)
    // TODO: Phase 2 - send connect_request here
  }

  return (
    <main className="flex flex-col items-center min-h-svh bg-gradient-to-b from-background via-background to-secondary/10 text-foreground selection:bg-primary/20">
      <StatusBar isConnected={isConnected} appName={process.env.NEXT_PUBLIC_APP_NAME || "QuickDrop"} />

      {/* Peer area */}
      <div className="flex-1 w-full flex items-center justify-center px-6 py-12">
        {peers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="relative" style={{ width: "500px", height: "500px" }}>
            {/* Faint orbit ring */}
            <div className="absolute inset-[60px] rounded-full border border-dashed border-border/20 pointer-events-none" />
            <div className="absolute inset-[120px] rounded-full border border-dashed border-border/10 pointer-events-none" />

            {/* Peers in orbital positions */}
            {peers.map((peer, i) => (
              <div
                key={peer.device_id}
                className="animate-in fade-in zoom-in-75 duration-500 fill-mode-both"
                style={getOrbitalStyle(i, peers.length)}
              >
                <PeerBubble peer={peer} onClick={handlePeerClick} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Device Bubble — always visible at bottom */}
      <div className="pb-12 pt-6">
        <div className="flex flex-col items-center gap-3 group">
          <div className="relative">
            <div className="absolute -inset-2 rounded-full bg-primary/5 blur-xl opacity-60" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-secondary/80 to-secondary/40 backdrop-blur-sm flex items-center justify-center border border-border/30 shadow-lg transition-shadow duration-300 group-hover:shadow-xl">
              <HugeiconsIcon icon={ComputerIcon} className="w-9 h-9 text-foreground/40" />
            </div>
          </div>
          <span className="text-sm font-medium text-foreground/50 w-44 text-center truncate">
            {deviceId ? `${deviceName} (You)` : "Connecting..."}
          </span>
        </div>
      </div>
    </main>
  )
}
