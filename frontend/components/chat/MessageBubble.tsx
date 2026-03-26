import { ChatMessage } from "@/types/chat"
import { cn, formatTimestamp } from "@/lib/utils"

interface MessageBubbleProps {
  message: ChatMessage
  isLastInGroup?: boolean
}

export default function MessageBubble({ message, isLastInGroup = true }: MessageBubbleProps) {
  if (message.type !== "text") return null

  const isSent = message.direction === "sent"

  return (
    <div
      className={cn(
        "flex w-full mb-1",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[75%] px-3 py-2 flex flex-col gap-0.5",
          isSent ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          isSent
            ? cn("rounded-2xl", isLastInGroup ? "rounded-br-sm" : "")
            : cn("rounded-2xl", isLastInGroup ? "rounded-bl-sm" : "")
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>
        <span
          className={cn(
            "text-[10px] select-none",
            isSent ? "text-primary-foreground/70 text-right" : "text-muted-foreground text-left"
          )}
        >
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  )
}
