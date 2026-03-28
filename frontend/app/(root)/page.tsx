"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import { getDeviceIcon } from "@/components/discovery/PeerBubble"
import { generateFullRandomName } from "@/lib/device"
import StatusBar from "@/components/discovery/StatusBar"
import PeerBubble from "@/components/discovery/PeerBubble"
import EmptyState from "@/components/discovery/EmptyState"
import RequestingModal from "@/components/handshake/RequestingModal"
import IncomingRequestModal from "@/components/handshake/IncomingRequestModal"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, PencilEdit02Icon, CheckmarkCircle01Icon, Cancel01Icon, ShuffleIcon } from "@hugeicons/core-free-icons"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
    status: connectionStatus,
    targetPeerId,
    incomingRequest,
    updateDeviceName,
    myDeviceType
  } = useWebRTC()

  const [isEditingName, setIsEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState("")

  const handleNameEdit = () => {
    if (!myDeviceId) return;
    setIsEditingName(true)
    setEditNameValue(myDeviceName)
  }

  const handleNameSave = () => {
    if (editNameValue.trim()) {
      updateDeviceName(editNameValue)
    }
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNameSave()
    } else if (e.key === "Escape") {
      setIsEditingName(false)
    }
  }

  useEffect(() => {
    if ((connectionStatus === "connecting" || connectionStatus === "connected") && targetPeerId) {
      router.push(`/chat/${targetPeerId}`)
    }
  }, [connectionStatus, targetPeerId, router])

  const handlePeerClick = (peerId: string) => {
    if (connectionStatus !== "idle") return;
    sendConnectRequest(peerId)
  }

  return (
    <main className="relative flex flex-col items-center h-[100dvh] bg-background text-foreground selection:bg-primary/20 overflow-hidden">

      {/* Pulse wave background — anchored to bottom center (behind my device) */}
      <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center justify-center">
        <div className="absolute w-[200px] h-[200px] rounded-full border border-foreground/[0.06] dark:border-foreground/[0.10] shadow-[0_0_40px_8px_rgba(100,100,200,0.04)] dark:shadow-[0_0_60px_10px_rgba(120,120,255,0.08)] animate-[pulse-wave_8s_ease-out_infinite]" />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-foreground/[0.06] dark:border-foreground/[0.10] shadow-[0_0_40px_8px_rgba(100,100,200,0.04)] dark:shadow-[0_0_60px_10px_rgba(120,120,255,0.08)] animate-[pulse-wave_8s_ease-out_2.6s_infinite]" />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-foreground/[0.06] dark:border-foreground/[0.10] shadow-[0_0_40px_8px_rgba(100,100,200,0.04)] dark:shadow-[0_0_60px_10px_rgba(120,120,255,0.08)] animate-[pulse-wave_8s_ease-out_5.2s_infinite]" />
        <div className="absolute w-40 h-40 rounded-full bg-primary/[0.06] dark:bg-primary/[0.10] blur-3xl" />
      </div>
      {/* Dot grid texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.06]" style={{
        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "32px 32px"
      }} />

      {/* Floating status badge — bottom right */}
      <StatusBar isConnected={wsConnected} />

      {/* Peer area */}
      <div className="flex flex-wrap justify-center gap-6 px-4 py-8 flex-1 content-center overflow-hidden">
        {peers.filter(p => !p.is_busy).length === 0 ? (
          <EmptyState />
        ) : (
          peers.filter(p => !p.is_busy).map((peer, i) => (
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
      <div className="pb-8 pt-4 z-10">
        <div className="flex flex-col items-center gap-1.5 group">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/5 blur-lg opacity-50" />
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-secondary/50 backdrop-blur-sm flex items-center justify-center border border-border/30 shadow-md transition-shadow duration-300 group-hover:shadow-lg">
              <HugeiconsIcon icon={getDeviceIcon(myDeviceName, myDeviceType)} className="w-6 h-6 sm:w-7 sm:h-7 text-foreground/40" />
            </div>
          </div>

          <div className="h-10 flex items-center justify-center z-20">
            {isEditingName ? (
              <div className="flex items-center gap-2 animate-in zoom-in-95 duration-200">
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    autoFocus
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    className="text-xs sm:text-sm font-medium text-center h-8 sm:h-9 w-40 sm:w-48 bg-background/80 backdrop-blur-sm border-primary/50 focus-visible:ring-primary/20 pr-10"
                    placeholder="Device name..."
                  />
                  <button
                    onClick={() => setEditNameValue(generateFullRandomName())}
                    className="absolute right-2 p-1.5 rounded-full text-foreground/40 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
                    title="Randomize name"
                  >
                    <HugeiconsIcon icon={ShuffleIcon} size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    onClick={handleNameSave}
                    className="p-2 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md cursor-pointer flex items-center justify-center transform active:scale-90"
                    title="Save (Enter)"
                  >
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} className="stroke-[2.5px]" />
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="p-2 rounded-full bg-secondary text-secondary-foreground/80 hover:bg-secondary-foreground/10 hover:text-secondary-foreground transition-all shadow-sm cursor-pointer flex items-center justify-center transform active:scale-90"
                    title="Cancel (Esc)"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} className="stroke-[2.5px]" />
                  </button>
                </div>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-2 cursor-pointer py-1 px-3 rounded-full hover:bg-secondary/50 transition-all group/name border border-transparent hover:border-border/50"
                      onClick={handleNameEdit}
                    >
                      <span className="text-xs sm:text-sm font-semibold text-foreground/60 group-hover/name:text-foreground max-w-[150px] sm:max-w-[200px] text-center truncate transition-colors" title={(wsConnected || peers.length > 0) ? `${myDeviceName} (You)` : "Connecting..."}>
                        {(wsConnected || peers.length > 0) ? `${myDeviceName} (You)` : "Connecting..."}
                      </span>
                      {myDeviceId && (
                        <HugeiconsIcon
                          icon={PencilEdit02Icon}
                          className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-foreground/30 group-hover/name:text-primary transition-colors opacity-0 group-hover/name:opacity-100"
                        />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-secondary text-foreground border border-border shadow-lg">
                    <p className="font-medium">Click to change device name</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {/* Logo + Brand — top left */}
      <div className="fixed top-4 left-4 sm:top-6 sm:left-6 z-50 flex items-center gap-2 sm:gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-300">
        {/* <Image src="/logo.png" alt="QuickDrop" width={24} height={24} className="rounded-md sm:w-[28px] sm:h-[28px]" /> */}
        <span className="text-xs sm:text-sm font-bold tracking-tight text-foreground/70">QuickDrop</span>
      </div>


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
