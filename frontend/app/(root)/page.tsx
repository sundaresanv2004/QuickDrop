"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import StatusBar from "@/components/discovery/StatusBar"
import PeerBubble from "@/components/discovery/PeerBubble"
import EmptyState from "@/components/discovery/EmptyState"
import RequestingModal from "@/components/handshake/RequestingModal"
import IncomingRequestModal from "@/components/handshake/IncomingRequestModal"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import Image from "next/image"

// 30 predefined scattered positions (x, y as percentages)
// Manually distributed perfectly across the screen so they never overlap.
const PREDEFINED_POSITIONS = [
  // Center-ish
  { left: 42, top: 40 }, { left: 58, top: 45 }, { left: 50, top: 25 }, { left: 35, top: 55 }, { left: 65, top: 32 },
  { left: 45, top: 65 }, { left: 55, top: 15 },
  // Mid ring
  { left: 25, top: 35 }, { left: 75, top: 45 }, { left: 30, top: 20 }, { left: 70, top: 25 }, { left: 20, top: 60 },
  { left: 80, top: 65 }, { left: 40, top: 80 }, { left: 60, top: 75 }, { left: 15, top: 45 }, { left: 85, top: 35 },
  // Outer ring
  { left: 10, top: 25 }, { left: 90, top: 55 }, { left: 35, top: 10 }, { left: 65, top: 10 }, { left: 25, top: 80 },
  { left: 75, top: 85 }, { left: 10, top: 70 }, { left: 90, top: 20 }, { left: 50, top: 90 }, { left: 5, top: 40 },
  { left: 95, top: 45 }, { left: 15, top: 15 }, { left: 85, top: 80 }
];

function getDevicePosition(index: number): React.CSSProperties {
  if (index < PREDEFINED_POSITIONS.length) {
    const pos = PREDEFINED_POSITIONS[index];
    return {
      position: "absolute" as const,
      left: `${pos.left}%`,
      top: `${pos.top}%`,
      transform: "translate(-50%, -50%)",
      animationDelay: `${index * 60}ms`,
    };
  }

  // After 30 devices, completely random placement
  return {
    position: "absolute" as const,
    left: `${10 + Math.random() * 80}%`,
    top: `${10 + Math.random() * 80}%`,
    transform: "translate(-50%, -50%)",
  };
}

export default function DiscoveryPage() {
  const router = useRouter()
  const { 
    wsConnected, 
    myDeviceId, 
    myDeviceName, 
    peers, 
    sendConnectRequest,
    connectionStatus,
    targetPeerId,
    incomingRequest,
    setOnChatReady
  } = useWebRTC()

  useEffect(() => {
    setOnChatReady(() => {
      if (targetPeerId) {
        router.push(`/chat/${targetPeerId}`)
      }
    })
  }, [setOnChatReady, targetPeerId, router])

  const handlePeerClick = (peerId: string) => {
    if (connectionStatus !== "idle") return;
    sendConnectRequest(peerId)
  }

  return (
    <main className="relative flex flex-col items-center h-[100dvh] bg-background text-foreground selection:bg-primary/20 overflow-hidden">

      {/* Pulse wave background — anchored to bottom center (behind my device) */}
      <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center justify-center">
        <div className="absolute w-[200px] h-[200px] rounded-full border border-white/[0.08] dark:border-white/[0.12] shadow-[0_0_60px_10px_rgba(120,120,255,0.06)] animate-[pulse-wave_8s_ease-out_infinite]" />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-white/[0.08] dark:border-white/[0.12] shadow-[0_0_60px_10px_rgba(120,120,255,0.06)] animate-[pulse-wave_8s_ease-out_2.6s_infinite]" />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-white/[0.08] dark:border-white/[0.12] shadow-[0_0_60px_10px_rgba(120,120,255,0.06)] animate-[pulse-wave_8s_ease-out_5.2s_infinite]" />
        <div className="absolute w-40 h-40 rounded-full bg-primary/[0.04] dark:bg-primary/[0.08] blur-3xl" />
      </div>
      {/* Dot grid texture */}
      <div className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-[0.08]" style={{
        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "32px 32px"
      }} />

      {/* Floating status badge — bottom right */}
      <StatusBar isConnected={wsConnected} />

      {/* Peer area */}
      <div className="flex flex-wrap justify-center gap-6 px-4 py-8 flex-1 content-center overflow-y-auto">
        {peers.length === 0 ? (
          <EmptyState />
        ) : (
          peers.map((peer, i) => (
            <div
              key={peer.device_id}
              className={`animate-in fade-in zoom-in-75 duration-500 fill-mode-both ${["requesting", "receiving"].includes(connectionStatus) ? "opacity-40 blur-[2px]" : ""}`}
            >
              <PeerBubble 
                peer={peer} 
                onClick={handlePeerClick} 
                disabled={connectionStatus !== "idle"}
              />
            </div>
          ))
        )}
      </div>

      {/* My device — bottom center */}
      <div className="pb-15 lg:pb-8 pt-4 z-10">
        <div className="flex flex-col items-center gap-2 group">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/5 blur-lg opacity-50" />
            <div className="relative w-14 h-14 rounded-full bg-secondary/50 backdrop-blur-sm flex items-center justify-center border border-border/30 shadow-md transition-shadow duration-300 group-hover:shadow-lg">
              <HugeiconsIcon icon={ComputerIcon} className="w-6 h-6 text-foreground/40" />
            </div>
          </div>
          <span className="text-xs font-medium text-foreground/40 w-4xl text-center truncate">
            {myDeviceId ? `${myDeviceName} (You)` : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Logo + Brand — bottom left */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-300">
        <Image src="/logo.png" alt="QuickDrop" width={28} height={28} className="rounded-md" />
        <span className="text-sm font-bold tracking-tight text-foreground/70">QuickDrop</span>
      </div>

      {/* Requesting Status Banner */}
      {connectionStatus === "requesting" && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-y-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-auto z-[100]">
          <div className="bg-primary/10 backdrop-blur-xl border border-primary/20 rounded-2xl p-4 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
               <HugeiconsIcon icon={Loading03Icon} className="w-5 h-5 text-primary animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-primary">Connecting...</p>
              <p className="text-xs text-primary/60 truncate">
                Waiting for {peers.find(p => p.device_id === targetPeerId)?.device_name || "peer"}
              </p>
            </div>
            <button 
              onClick={() => useWebRTC().cancelRequest()}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 rounded-full text-xs font-bold text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <RequestingModal />
      <IncomingRequestModal />

      {/* Pulse wave keyframes */}
      <style jsx>{`
        @keyframes pulse-wave {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(10);
            opacity: 0;
          }
        }
      `}</style>
    </main>
  )
}
