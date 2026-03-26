"use client"

import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface ChatHeaderProps {
  peerName: string
  connectionStatus: ConnectionStatus
  onLeave: () => void
}

export default function ChatHeader({ peerName, connectionStatus, onLeave }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10">
      <Button variant="ghost" size="icon" onClick={onLeave}>
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
      </Button>

      <div className="flex flex-col items-center">
        <span className="font-semibold text-sm">{peerName}</span>
        <span className="text-xs text-muted-foreground">
          End-to-end encrypted
        </span>
      </div>

      {connectionStatus === "connected" ? (
        <Badge variant="default" className="gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live
        </Badge>
      ) : connectionStatus === "connecting" ? (
        <Badge variant="secondary" className="gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Connecting
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Offline
        </Badge>
      )}
    </header>
  )
}
