"use client"

import { ChatMessage } from "@/types/chat"
import EmptyChat from "./EmptyChat"
import MessageBubble from "./MessageBubble"
import FileBubble from "./FileBubble"
import TypingIndicator from "./TypingIndicator"
import {
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  MessageScrollerProvider,
} from "@/components/ui/message-scroller"
import { Marker, MarkerContent } from "@/components/ui/marker"

interface MessageListProps {
  messages: ChatMessage[]
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

export default function MessageList({ messages, peerName }: MessageListProps) {
  if (messages.length === 0) {
    return <EmptyChat />
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-background">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="py-2">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-4">
              {messages.map((msg, index) => {
                const prevMsg = messages[index - 1]
                const nextMsg = messages[index + 1]
                
                const showDateSep = !prevMsg || !isSameDay(prevMsg.timestamp, msg.timestamp)
                const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction

                return (
                  <MessageScrollerItem
                    key={msg.id}
                    messageId={msg.id}
                    scrollAnchor={msg.direction === "sent"}
                  >
                    {showDateSep && (
                      <Marker variant="separator" className="my-4">
                        <MarkerContent>{formatDateLabel(msg.timestamp)}</MarkerContent>
                      </Marker>
                    )}

                    {msg.type === "text" ? (
                      <MessageBubble
                        message={msg}
                        isLastInGroup={isLastInGroup}
                        peerName={peerName}
                      />
                    ) : msg.type === "file" ? (
                      <FileBubble message={msg} peerName={peerName} isLastInGroup={isLastInGroup} />
                    ) : null}
                  </MessageScrollerItem>
                )
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  )
}
