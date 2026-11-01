"use client"

import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Locker01Icon } from "@hugeicons/core-free-icons"
import { getDeviceIcon } from "@/components/discovery/PeerBubble"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import SetTheme from "@/components/shared/setTheme"
import { cn } from "@/lib/utils"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface ChatHeaderProps {
  peerName: string
  peerType: string
  connectionStatus: ConnectionStatus
  onLeave: () => void
}

type BadgeVariant = "success" | "warning" | "danger" | "secondary"

const statusConfig: Record<ConnectionStatus, {
  label: string
  dotColor: string
  pulse: boolean
  badgeVariant: BadgeVariant
  subLabel: string
}> = {
  connected:    { label: "Live",        dotColor: "bg-emerald-500", pulse: true,  badgeVariant: "success",   subLabel: "End-to-end encrypted"    },
  connecting:   { label: "Connecting",  dotColor: "bg-amber-500",   pulse: true,  badgeVariant: "warning",   subLabel: "Establishing connection..." },
  reconnecting: { label: "Reconnecting", dotColor: "bg-amber-500",  pulse: true,  badgeVariant: "warning",   subLabel: "Connection interrupted..." },
  disconnected: { label: "Offline",    dotColor: "bg-red-500",     pulse: false, badgeVariant: "danger",    subLabel: "Connection lost"           },
  rejected:     { label: "Rejected",    dotColor: "bg-red-500",     pulse: false, badgeVariant: "danger",    subLabel: "Connection rejected"       },
  left:         { label: "Offline",     dotColor: "bg-zinc-400",    pulse: false, badgeVariant: "secondary", subLabel: "Peer left the chat"        },
  idle:         { label: "Idle",        dotColor: "bg-zinc-400",    pulse: false, badgeVariant: "secondary", subLabel: "Idle"                      },
  requesting:   { label: "Requesting",  dotColor: "bg-amber-500",   pulse: true,  badgeVariant: "warning",   subLabel: "Awaiting response..."      },
  receiving:    { label: "Incoming",    dotColor: "bg-sky-500",     pulse: true,  badgeVariant: "warning",   subLabel: "Incoming request"          },
}

export default function ChatHeader({ peerName, peerType, connectionStatus, onLeave }: ChatHeaderProps) {
  const config = statusConfig[connectionStatus] ?? statusConfig.idle
  const initials = peerName.slice(0, 2).toUpperCase()
  const isConnected = connectionStatus === "connected"

  return (
    <header className="flex items-center gap-3 px-3 py-2.5 border-b bg-background/95 backdrop-blur-md sticky top-0 z-20 w-full">
      {/* Back button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onLeave}
        className="size-9 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={20} color="currentColor" />
      </Button>

      {/* Peer avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Avatar with status dot */}
        <div className="relative shrink-0">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs font-bold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Live status dot */}
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
            config.dotColor,
            config.pulse && "animate-pulse"
          )} />
        </div>

        {/* Name + status */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={getDeviceIcon(peerName, peerType)}
              size={13}
              className="text-muted-foreground shrink-0"
            />
            <span className="font-semibold text-sm truncate leading-tight">{peerName}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[10px] leading-tight truncate",
              isConnected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}>
              {config.subLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Right — status badge + theme toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={config.badgeVariant} className="gap-1 px-2 h-5">
          <span className={cn("size-1.5 rounded-full", config.dotColor, config.pulse && "animate-pulse")} />
          {config.label}
        </Badge>
        <SetTheme />
      </div>
    </header>
  )
}
