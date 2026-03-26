import { ChatMessage } from "@/types/chat"
import { cn, formatTimestamp } from "@/lib/utils"
import { useWebRTC } from "@/context/WebRTCContext"
import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SmileIcon } from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import ReactionBadge from "./ReactionBadge"

interface MessageBubbleProps {
  message: ChatMessage
  isLastInGroup?: boolean
}

export default function MessageBubble({ message, isLastInGroup = true }: MessageBubbleProps) {
  const { sendReaction, myDeviceId } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "text") return null

  const isSent = message.direction === "sent"
  const reactions = message.reactions || {}

  const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

  const handleReaction = (emoji: string) => {
    sendReaction(message.id, emoji)
    setShowPicker(false)
  }

  const EmojiPicker = ({ align }: { align: "start" | "end" }) => (
    <Popover open={showPicker} onOpenChange={setShowPicker}>
      <PopoverTrigger asChild>
        <button className="opacity-0 group-hover/msg:opacity-100 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-all cursor-pointer flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={SmileIcon} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align={align} 
        className="w-auto p-1.5 rounded-full bg-popover/90 backdrop-blur-xl border-border/50 shadow-xl flex flex-row gap-1 animate-in zoom-in-95 duration-200"
      >
        {emojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className={cn(
              "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90",
              myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
            )}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )

  return (
    <div
      className={cn(
        "flex w-full mb-1 group/msg relative",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[75%]",
        isSent ? "items-end" : "items-start"
      )}>
        <div className="flex items-center gap-1 w-full">
          {/* Reaction trigger is on the opposite side of the bubble */}
          {isSent && <EmojiPicker align="end" />}
          
          <div
            className={cn(
              "px-3 py-2 flex flex-col gap-0.5 select-none transition-transform flex-1 min-w-0",
              isSent ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              isSent
                ? cn("rounded-2xl", isLastInGroup ? "rounded-br-sm" : "")
                : cn("rounded-2xl", isLastInGroup ? "rounded-bl-sm" : "")
            )}
            onContextMenu={(e) => {
              e.preventDefault()
              setShowPicker(true)
            }}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words min-w-[60px]">
              {message.content}
            </p>
            <div className={cn("flex -mt-1.5 opacity-70", isSent ? "justify-end" : "justify-start")}>
              <span className={cn("text-[10px] select-none whitespace-nowrap", isSent ? "text-primary-foreground" : "text-muted-foreground")}>
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
          </div>

          {!isSent && <EmojiPicker align="start" />}
        </div>

        {/* Reaction Display */}
        {Object.keys(reactions).length > 0 && (
          <div className={cn(
            "flex flex-wrap gap-1 mt-1.5 px-1",
            isSent ? "justify-end" : "justify-start"
          )}>
            {Object.entries(reactions).map(([emoji, userIds]) => (
              <ReactionBadge
                key={emoji}
                emoji={emoji}
                userIds={userIds}
                myDeviceId={myDeviceId}
                onClick={handleReaction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
