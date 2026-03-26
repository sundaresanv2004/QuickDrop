"use client"

import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ComputerIcon, SmartPhone01Icon, Tablet01Icon } from "@hugeicons/core-free-icons"
import { getDeviceIcon } from "@/components/discovery/PeerBubble"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import SetTheme from "@/components/shared/setTheme"
import { cn } from "@/lib/utils"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface ChatHeaderProps {
  peerName: string
  peerType: string
  connectionStatus: ConnectionStatus
  onLeave: () => void
}

const statusConfig = {
  connected: {
    label:    "Live",
    dotClass: "bg-emerald-500 animate-pulse",
    variant:  "success" as const,
  },
  connecting: {
    label:    "Connecting",
    dotClass: "bg-amber-500 animate-pulse",
    variant:  "warning" as const,
  },
  disconnected: {
    label:    "Offline",
    dotClass: "bg-red-500",
    variant:  "destructive" as const,
  },
  rejected: {
    label:    "Rejected",
    dotClass: "bg-red-500",
    variant:  "destructive" as const,
  },
  left: {
    label:    "Offline",
    dotClass: "bg-muted-foreground",
    variant:  "secondary" as const,
  },
  idle: {
    label:    "Idle",
    dotClass: "bg-muted-foreground",
    variant:  "secondary" as const,
  },
  requesting: {
    label:    "Requesting",
    dotClass: "bg-amber-500 animate-pulse",
    variant:  "warning" as const,
  },
  receiving: {
    label:    "Incoming",
    dotClass: "bg-sky-500 animate-pulse",
    variant:  "info" as const,
  },
}

export default function ChatHeader({ peerName, peerType, connectionStatus, onLeave }: ChatHeaderProps) {
  const config = statusConfig[connectionStatus] ?? statusConfig.idle

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10 w-full">
      <Button variant="ghost" size="icon" onClick={onLeave}>
        <HugeiconsIcon icon={ArrowLeft01Icon} size={20} color="currentColor" />
      </Button>

      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={getDeviceIcon(peerName, peerType)} size={16} className="text-muted-foreground/50" />
          <span className="font-semibold text-sm max-w-[120px] sm:max-w-none truncate">{peerName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {connectionStatus === "connected"
            ? "End-to-end encrypted"
            : connectionStatus === "connecting"
            ? "Establishing connection..."
            : connectionStatus === "left"
            ? "Peer left the chat"
            : "Connection lost"}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            config.dotClass
          )} />
          <Badge variant={config.variant} className="text-[10px] px-1.5 py-0 font-medium">
            {config.label}
          </Badge>
        </div>
        <div className="-mr-2">
          <SetTheme />
        </div>
      </div>
    </header>
  )
}

