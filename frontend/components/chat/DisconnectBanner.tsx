"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  WifiDisconnected01Icon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface DisconnectBannerProps {
  connectionStatus: ConnectionStatus
  onGoBack: () => void
}

export default function DisconnectBanner({ connectionStatus, onGoBack }: DisconnectBannerProps) {
  if (connectionStatus !== "disconnected") return null

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
      {/* Left: icon + message */}
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={WifiDisconnected01Icon}
          size={16}
          color="currentColor"
          className="text-destructive flex-shrink-0"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-destructive leading-tight">
            Connection lost
          </span>
          <span className="text-xs text-muted-foreground leading-tight mt-0.5">
            The peer disconnected. Your messages are not saved.
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
