"use client"

interface TypingIndicatorProps {
  isTyping: boolean
  peerName: string
}

export default function TypingIndicator({ isTyping, peerName }: TypingIndicatorProps) {
  if (!isTyping) return null

  return (
    <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-2 border-t">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
      </span>
      <span>{peerName} is typing</span>
    </div>
  )
}
