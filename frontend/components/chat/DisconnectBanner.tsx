"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { WifiDisconnected01Icon, ArrowLeft01Icon, Logout01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ConnectionStatus } from "@/context/WebRTCContext"

interface DisconnectBannerProps {
  connectionStatus: ConnectionStatus
  peerName: string
  onGoBack: () => void
}

export default function DisconnectBanner({ connectionStatus, peerName, onGoBack }: DisconnectBannerProps) {
  if (connectionStatus === "reconnecting") {
    return (
      <div role="status" className="w-full flex items-center gap-3 px-4 py-3 bg-amber-500/5 border-b border-amber-500/15 animate-in slide-in-from-top duration-300">
        <Spinner className="shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold leading-tight">Reconnecting…</span>
          <span className="text-xs text-muted-foreground leading-tight mt-0.5">
            Keep QuickDrop open. Your chat will continue when the connection returns.
          </span>
        </div>
      </div>
    )
  }

  if (connectionStatus !== "disconnected" && connectionStatus !== "left") return null

  const isLeft = connectionStatus === "left"

  return (
    <div className={cn(
      "w-full flex items-center justify-between gap-3 px-4 py-3 animate-in slide-in-from-top duration-300",
      isLeft
        ? "bg-muted/40 border-b border-border"
        : "bg-destructive/5 border-b border-destructive/15"
    )}>
      {/* Icon + message */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "shrink-0 size-8 rounded-full flex items-center justify-center",
          isLeft ? "bg-muted" : "bg-destructive/10"
        )}>
          <HugeiconsIcon
            icon={isLeft ? Logout01Icon : WifiDisconnected01Icon}
            size={15}
            className={isLeft ? "text-muted-foreground" : "text-destructive"}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-sm font-semibold leading-tight",
            isLeft ? "text-foreground" : "text-destructive"
          )}>
            {isLeft ? (
              <><span className="font-bold">{peerName}</span> left the chat</>
            ) : (
              "Connection lost"
            )}
          </span>
          <span className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
            {isLeft
              ? "The conversation has ended. Your messages are only stored locally."
              : "The peer disconnected unexpectedly. Your messages are not saved."}
          </span>
        </div>
      </div>

      {/* Go Back button */}
      <Button
        variant={isLeft ? "outline" : "destructive"}
        size="sm"
        onClick={onGoBack}
        className="shrink-0 rounded-full"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={8} color="currentColor" />
        Go Back
      </Button>
    </div>
  )
}
