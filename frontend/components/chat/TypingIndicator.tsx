"use client"

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
    <div className="px-4 pb-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <span className="text-xs text-muted-foreground/80 font-medium italic">
        {peerName} is typing...
      </span>
    </div>
  )
}
