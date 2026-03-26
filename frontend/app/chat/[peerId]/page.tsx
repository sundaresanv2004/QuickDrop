"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import ChatHeader from "@/components/chat/ChatHeader"
import MessageList from "@/components/chat/MessageList"
import TypingIndicator from "@/components/chat/TypingIndicator"
import MessageInput from "@/components/chat/MessageInput"

export default function ChatPage() {
  const router = useRouter()
  const params = useParams()
  const peerId = params.peerId as string

  const {
    connectionStatus,
    peers,
    messages,
    isTyping,
    chatChannel,
    sendChatMessage,
    sendSystemMessage,
    resetConnection,
  } = useWebRTC()

  // ─── Guard: redirect if no active connection ───
  useEffect(() => {
    if (
      connectionStatus !== "connected" &&
      connectionStatus !== "connecting"
    ) {
      router.replace("/")
    }
  }, [connectionStatus, router])

  const peerName =
    peers.find(p => p.device_id === peerId)?.device_name ?? "Unknown Device"

  const isChannelOpen = chatChannel?.readyState === "open"

  const handleLeave = () => {
    sendSystemMessage({ type: "bye" })
    resetConnection()
    router.replace("/")
  }

  const handleSendMessage = (content: string) => {
    sendChatMessage(content)
  }

  const handleFileSelect = (file: File) => {
    console.log("[FILE] Selected:", file.name)
    // TODO Step 8: implement file send
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader
        peerName={peerName}
        connectionStatus={connectionStatus}
        onLeave={handleLeave}
      />

      <MessageList messages={messages} />

      <TypingIndicator isTyping={isTyping} peerName={peerName} />

      <MessageInput
        onSendMessage={handleSendMessage}
        onFileSelect={handleFileSelect}
        disabled={!isChannelOpen}
      />
    </div>
  )
}
