"use client"

import { useEffect, useRef } from "react"
import { ChatMessage } from "@/types/chat"
import EmptyChat from "./EmptyChat"
import MessageBubble from "./MessageBubble"
import FileBubble from "./FileBubble"
import TypingIndicator from "./TypingIndicator"
import { cn } from "@/lib/utils"

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

export default function MessageList({ messages, isTyping, peerName }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  if (messages.length === 0) {
    return <EmptyChat />
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 overscroll-contain">
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
  )
}
