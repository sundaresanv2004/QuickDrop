"use client"

import { cn } from "@/lib/utils"

interface TypingIndicatorProps {
  isTyping: boolean
  peerName: string
}

export default function TypingIndicator({
  isTyping,
  peerName,
}: TypingIndicatorProps) {
  if (!isTyping) return null

  return (
    <div className="px-4 py-2 border-t bg-background shrink-0">
      <div className="flex items-center gap-2">
        {/* Animated dot group */}
        <div className="flex items-center gap-1 h-4">
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: "200ms", animationDuration: "1s" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: "400ms", animationDuration: "1s" }}
          />
        </div>

        {/* Text label */}
        <span className="text-xs text-muted-foreground">
          {peerName} is typing
        </span>
      </div>
    </div>
  )
}
