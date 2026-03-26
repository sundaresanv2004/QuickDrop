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
    <div className="py-2 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-1 items-start">
        <div className="px-3 py-2.5 rounded-2xl rounded-bl-sm bg-muted shadow-sm flex items-center justify-center">
          <div className="flex gap-1.5">
            <div 
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" 
              style={{ animationDelay: "0ms" }}
            />
            <div 
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" 
              style={{ animationDelay: "150ms" }}
            />
            <div 
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" 
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60 ml-1 font-medium italic">
          {peerName} is typing...
        </span>
      </div>
    </div>
  )
}
