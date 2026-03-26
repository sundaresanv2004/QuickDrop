"use client"

import { useRef, useEffect } from "react"
import type { ChatMessage } from "@/types/chat"
import EmptyChat from "./EmptyChat"

interface MessageListProps {
  messages: ChatMessage[]
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <EmptyChat />
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className="py-1 text-sm">
            [{msg.direction}] {msg.type === "text" ? msg.content : msg.file?.name}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  )
}
