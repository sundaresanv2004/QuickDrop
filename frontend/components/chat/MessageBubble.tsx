"use client"

import { ChatMessage, LinkPreview } from "@/types/chat"
import LinkEmbed from "./LinkEmbed"
import { cn, formatTimestamp } from "@/lib/utils"
import { useWebRTC } from "@/context/WebRTCContext"
import { useWebRTCBridge } from "@/hooks/useWebRTCBridge"
import { useState, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SmileIcon, Copy01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
import ReactionBadge from "./ReactionBadge"
import { Message, MessageContent, MessageFooter, MessageAvatar } from "@/components/ui/message"
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface MessageBubbleProps {
  message: ChatMessage
  isLastInGroup?: boolean
  peerName: string
}

export default function MessageBubble({ message, isLastInGroup = true, peerName }: MessageBubbleProps) {
  const { sendReaction, myDeviceId } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "text") return null

  const isSent = message.direction === "sent"
  const reactions = message.reactions || {}
  const hasReactions = Object.keys(reactions).length > 0

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
        collisionPadding={16}
        sideOffset={6}
        className="w-[220px] px-1 py-0.5 rounded-full bg-popover/90 backdrop-blur-xl border-border/50 shadow-xl animate-in zoom-in-95 duration-150"
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
          const cacheKey = `preview_cache_${url}`
          try {
            const cached = sessionStorage.getItem(cacheKey)
            if (cached) { updateMessage(message.id, { linkPreview: JSON.parse(cached) }); return }
          } catch(e) {}
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"
          const res = await fetch(`${apiUrl}/link-preview?url=${encodeURIComponent(url)}`)
          if (res.ok) {
            const data = await res.json()
            if (data && (data.title || data.image)) {
              try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch(e) {}
              updateMessage(message.id, { linkPreview: data })
            }
          }
        } catch (err) { console.error("[LinkPreview] Retroactive fetch failed:", err) }
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
              <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                className={cn("underline underline-offset-4 font-semibold transition-opacity hover:opacity-70 break-all",
                  isSent ? "text-primary-foreground/90" : "text-primary")}
                onClick={(e) => e.stopPropagation()}
              >{part}</a>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </>
    )
  }

  const msgAlign = isSent ? "end" : "start"
  const senderName = isSent ? "Me" : peerName
  const initials = senderName.charAt(0).toUpperCase()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("group/msg w-full animate-in fade-in slide-in-from-bottom-1 duration-300", isSent ? "mb-1" : "mb-1")}>
          <Message align={msgAlign}>
            {/* Avatar — only show on last-in-group */}
            {isLastInGroup && (
              <MessageAvatar>
                <Avatar className="size-8">
                  <AvatarFallback className={cn("text-xs font-semibold", isSent ? "bg-primary text-primary-foreground" : "bg-muted")}>{initials}</AvatarFallback>
                </Avatar>
              </MessageAvatar>
            )}

            <MessageContent>
              <div className={cn("flex items-center gap-1", isSent ? "justify-end" : "justify-start")}>
                {isSent && <EmojiPicker align="end" />}

                <Bubble
                  variant={isSent ? "default" : "muted"}
                  align={msgAlign}
                  className={cn(hasReactions && "mb-5")}
                >
                  <BubbleContent className={cn(
                    "text-sm leading-relaxed whitespace-pre-wrap break-words",
                    isSent ? "text-primary-foreground" : "text-foreground"
                  )}>
                    {message.linkPreview && <LinkEmbed preview={message.linkPreview} isSent={isSent} />}
                    <LinkifiedText text={message.content || ""} />
                  </BubbleContent>

                  {hasReactions && (
                    <BubbleReactions side="bottom" align={isSent ? "start" : "end"}>
                      {Object.entries(reactions).map(([emoji, userIds]) => (
                        <ReactionBadge
                          key={emoji}
                          emoji={emoji}
                          userIds={userIds as string[]}
                          myDeviceId={myDeviceId}
                          onClick={handleReaction}
                        />
                      ))}
                    </BubbleReactions>
                  )}
                </Bubble>

                {!isSent && <EmojiPicker align="start" />}
              </div>

              {/* Time shown only on the last message in a group */}
              {isLastInGroup && (
                <MessageFooter className={cn("gap-1", isSent ? "justify-end pr-1" : "justify-start pl-1")}>
                  <span className="text-[10px] text-muted-foreground select-none tabular-nums">
                    {formatTimestamp(message.timestamp)}
                  </span>
                </MessageFooter>
              )}
            </MessageContent>

          </Message>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl overflow-hidden" collisionPadding={16}>
        <div className="flex flex-row gap-1 overflow-x-auto scrollbar-hide py-2 px-2 border-b border-border/20 mb-1 w-full">
          {emojis.map(emoji => (
            <ContextMenuItem key={emoji} onClick={() => handleReaction(emoji)}
              className={cn(
                "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90 shrink-0 p-0 focus:bg-accent cursor-pointer",
                myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
              )}
            >{emoji}</ContextMenuItem>
          ))}
        </div>

        {message.content?.match(/(https?:\/\/[^\s]+)/) ? (
          <>
            <ContextMenuItem onClick={() => { const url = message.content?.match(/(https?:\/\/[^\s]+)/)?.[0]; if (url) window.open(url, "_blank") }} className="gap-3 mt-1 cursor-pointer">
              <HugeiconsIcon icon={Link01Icon} size={18} /><span>Open Link</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { const url = message.content?.match(/(https?:\/\/[^\s]+)/)?.[0]; if (url) { navigator.clipboard.writeText(url); toast.success("Link copied") } }} className="gap-3 cursor-pointer">
              <HugeiconsIcon icon={Copy01Icon} size={18} /><span>Copy Link</span>
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onClick={() => { navigator.clipboard.writeText(message.content || ""); toast.success("Text copied") }} className="gap-3 mt-1 cursor-pointer">
            <HugeiconsIcon icon={Copy01Icon} size={18} /><span>Copy Text</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
