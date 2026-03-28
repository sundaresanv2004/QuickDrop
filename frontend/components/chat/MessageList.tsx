"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ChatMessage } from "@/types/chat"
import EmptyChat from "./EmptyChat"
import MessageBubble from "./MessageBubble"
import FileBubble from "./FileBubble"
import TypingIndicator from "./TypingIndicator"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

interface MessageListProps {
  messages: ChatMessage[]
  isTyping: boolean
  peerName: string
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.toDateString() === db.toDateString()
}

function formatDateLabel(timestamp: number): string {
  const d = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

const SCROLL_THRESHOLD = 150 // px from bottom to consider "at bottom"

export default function MessageList({ messages, isTyping, peerName }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMessageCountRef = useRef(messages.length)

  // Check if user is near the bottom of the scroll container
  const checkIfAtBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distanceFromBottom < SCROLL_THRESHOLD
  }, [])

  // Handle scroll events to track position
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom()
    setIsAtBottom(atBottom)
    if (atBottom) {
      setUnreadCount(0)
    }
  }, [checkIfAtBottom])

  // When new messages arrive, either auto-scroll or increment unread count
  useEffect(() => {
    const newCount = messages.length
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = newCount

    if (newCount <= prevCount) return // Not a new message (could be update/reaction)

    const newMessages = newCount - prevCount

    if (isAtBottom) {
      // User is at bottom — auto-scroll smoothly
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 50)
    } else {
      // User has scrolled up — don't scroll, just show badge
      setUnreadCount(prev => prev + newMessages)
    }
  }, [messages.length, isAtBottom])

  // Auto-scroll for typing indicator only if at bottom
  useEffect(() => {
    if (isTyping && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [isTyping, isAtBottom])

  // Scroll to bottom on first mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    setUnreadCount(0)
    setIsAtBottom(true)
  }

  if (messages.length === 0) {
    return <EmptyChat />
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 sm:px-4 py-4 overscroll-none touch-pan-y"
      >
        {messages.map((msg, index) => {
          const prevMsg = messages[index - 1]
          const nextMsg = messages[index + 1]
          
          const showDateSep = !prevMsg || !isSameDay(prevMsg.timestamp, msg.timestamp)
          const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[11px] text-muted-foreground bg-muted px-3 py-0.5 rounded-full">
                    {formatDateLabel(msg.timestamp)}
                  </span>
                </div>
              )}

              {msg.type === "text" ? (
                <MessageBubble
                  message={msg}
                  isLastInGroup={isLastInGroup}
                />
              ) : msg.type === "file" ? (
                <FileBubble message={msg} />
              ) : null}

            </div>
          )
        })}
        
        <TypingIndicator isTyping={isTyping} peerName={peerName} />
        
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll-to-bottom FAB */}
      <button
        onClick={scrollToBottom}
        className={cn(
          "absolute right-4 bottom-4 w-9 h-9 rounded-full",
          "bg-background/40 backdrop-blur-xl border border-border/30",
          "flex items-center justify-center",
          "shadow-md",
          "transition-all duration-300 ease-out cursor-pointer",
          "hover:bg-background/60 active:scale-90",
          isAtBottom
            ? "opacity-0 translate-y-4 pointer-events-none"
            : "opacity-100 translate-y-0"
        )}
        aria-label="Scroll to bottom"
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={18} className="text-foreground" />
        
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
