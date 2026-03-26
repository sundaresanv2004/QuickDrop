"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  WifiDisconnected01Icon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface DisconnectBannerProps {
  connectionStatus: ConnectionStatus
  onGoBack: () => void
}

export default function DisconnectBanner({ connectionStatus, onGoBack }: DisconnectBannerProps) {
  if (connectionStatus !== "disconnected" && connectionStatus !== "left") return null

  const isLeft = connectionStatus === "left"

  return (
    <div className={cn(
      "w-full border-b flex items-center justify-between gap-3 px-4 py-2.5 animate-in slide-in-from-top duration-300",
      isLeft ? "bg-muted/50 border-border" : "bg-destructive/10 border-destructive/20"
    )}>
      {/* Left: icon + message */}
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={WifiDisconnected01Icon}
          size={16}
          color="currentColor"
          className={cn("flex-shrink-0", isLeft ? "text-muted-foreground" : "text-destructive")}
        />
        <div className="flex flex-col">
          <span className={cn(
            "text-sm font-medium leading-tight",
            isLeft ? "text-foreground" : "text-destructive"
          )}>
            {isLeft ? "User left the chat" : "Connection lost"}
          </span>
          <span className="text-xs text-muted-foreground leading-tight mt-0.5">
            {isLeft ? "The peer has left the conversation." : "The peer disconnected. Your messages are not saved."}
          </span>
        </div>
      </div>

      {/* Right: go back button */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onGoBack}
        className="flex-shrink-0 gap-1.5 h-8"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          size={14}
          color="currentColor"
        />
        Go Back
      </Button>
    </div>
  )
}
