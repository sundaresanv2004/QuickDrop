import { ChatMessage, LinkPreview } from "@/types/chat"
import LinkEmbed from "./LinkEmbed"
import { cn, formatTimestamp } from "@/lib/utils"
import { useWebRTC } from "@/context/WebRTCContext"
import { useWebRTCBridge } from "@/hooks/useWebRTCBridge"
import { useState, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SmileIcon, TickDouble01Icon, Copy01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
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

  const emojis = ["👍", "❤️", "😂", "😅", "🙏", "🎉", "😮", "😢", "😡", "🙌", "🔥", "✨", "💯"]

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
        className="w-[230px] px-1 py-0.5 rounded-full bg-popover/90 backdrop-blur-xl border-border/50 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex flex-row gap-0.5 overflow-x-auto scrollbar-hide py-2 px-1">
          {emojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className={cn(
                "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90 shrink-0",
                myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )

  const { updateMessage } = useWebRTCBridge()

  // Retroactive link preview fetch
  useEffect(() => {
    if (message.type !== "text" || message.linkPreview || !message.content) return

    const urlRegex = /(https?:\/\/[^\s]+)/g
    const match = message.content.match(urlRegex)
    if (match && match[0]) {
      const url = match[0]
      const fetchPreview = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"
          const res = await fetch(`${apiUrl}/link-preview?url=${encodeURIComponent(url)}`)
          if (res.ok) {
            const data = await res.json()
            if (data && (data.title || data.image)) {
              updateMessage(message.id, { linkPreview: data })
            }
          }
        } catch (err) {
          console.error("[LinkPreview] Retroactive fetch failed:", err)
        }
      }
      fetchPreview()
    }
  }, [message.id, message.content, message.linkPreview, message.type, updateMessage])

  const LinkifiedText = ({ text }: { text: string }) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)

    return (
      <>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "underline underline-offset-4 font-semibold transition-opacity hover:opacity-70 break-all",
                  isSent ? "text-primary-foreground" : "text-primary"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {part}
              </a>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex w-full mb-1 group/msg relative animate-in fade-in slide-in-from-bottom-1 duration-300",
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
                  "px-3 py-2 flex flex-col gap-0.5 select-none transition-transform flex-1 min-w-0 shadow-sm",
                  isSent ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  isSent
                    ? cn("rounded-2xl", isLastInGroup ? "rounded-br-sm" : "")
                    : cn("rounded-2xl", isLastInGroup ? "rounded-bl-sm" : "")
                )}
              >
                {message.linkPreview && <LinkEmbed preview={message.linkPreview} isSent={isSent} />}
                <p className="text-sm border-none leading-relaxed whitespace-pre-wrap break-words min-w-[60px]">
                  <LinkifiedText text={message.content || ""} />
                </p>
                <div className={cn("flex items-center gap-1 mt-1 opacity-70", isSent ? "justify-end" : "justify-start")}>
                  <span className={cn("text-[9px] select-none whitespace-nowrap font-medium", isSent ? "text-primary-foreground" : "text-muted-foreground")}>
                    {formatTimestamp(message.timestamp)}
                  </span>
                  {isSent && (
                    <HugeiconsIcon
                      icon={TickDouble01Icon}
                      size={12}
                      className={cn("opacity-70", isSent ? "text-primary-foreground" : "text-muted-foreground")}
                    />
                  )}
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
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl">
        {message.content?.match(/(https?:\/\/[^\s]+)/) && (
          <>
            <ContextMenuItem
              onClick={() => {
                const url = message.content?.match(/(https?:\/\/[^\s]+)/)?.[0]
                if (url) window.open(url, "_blank")
              }}
              className="gap-3"
            >
              <HugeiconsIcon icon={Link01Icon} size={18} />
              <span>Open Link</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => {
                const url = message.content?.match(/(https?:\/\/[^\s]+)/)?.[0]
                if (url) {
                  navigator.clipboard.writeText(url)
                  toast.success("Link copied")
                }
              }}
              className="gap-3"
            >
              <HugeiconsIcon icon={Copy01Icon} size={18} />
              <span>Copy Link</span>
            </ContextMenuItem>
          </>
        )}

        {!message.content?.match(/(https?:\/\/[^\s]+)/) && (
          <ContextMenuItem
            onClick={() => {
              navigator.clipboard.writeText(message.content || "")
              toast.success("Text copied")
            }}
            className="gap-3"
          >
            <HugeiconsIcon icon={Copy01Icon} size={18} />
            <span>Copy Text</span>
          </ContextMenuItem>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-3">
            <HugeiconsIcon icon={SmileIcon} size={18} />
            <span>React</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="px-1 py-0.5 rounded-full w-[230px]">
            <div className="flex flex-row gap-0.5 overflow-x-auto scrollbar-hide py-2 px-1">
              {emojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90 shrink-0",
                    myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}
