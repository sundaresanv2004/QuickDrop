"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import ChatHeader from "@/components/chat/ChatHeader"
import MessageList from "@/components/chat/MessageList"
import TypingIndicator from "@/components/chat/TypingIndicator"
import MessageInput from "@/components/chat/MessageInput"
import DisconnectBanner from "@/components/chat/DisconnectBanner"

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
    sendFile,
  } = useWebRTC()

  // ─── Guard: redirect if no active connection ───
  useEffect(() => {
    if (
      connectionStatus !== "connected" &&
      connectionStatus !== "connecting" &&
      connectionStatus !== "disconnected" &&
      connectionStatus !== "left"
    ) {
      router.replace("/")
    }
  }, [connectionStatus, router])

  const handleBeforeUnload = () => {
    sendSystemMessage({ type: "bye" })
  }

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [sendSystemMessage])

  const peer = peers.find(p => p.device_id === peerId)
  const peerName = peer?.device_name ?? "Unknown Device"
  const peerType = peer?.device_type ?? "unknown"

  const isChannelOpen = 
    chatChannel?.readyState === "open" && 
    connectionStatus === "connected"

  const handleLeave = () => {
    sendSystemMessage({ type: "bye" })
    resetConnection()
    router.replace("/")
  }

  const handleSendMessage = (content: string) => {
    sendChatMessage(content)
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024   // 500MB limit

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large. Maximum size is 500MB.\nSelected: ${
        (file.size / 1024 / 1024).toFixed(1)
      }MB`)
      return
    }
    sendFile(file).catch(err => {
      console.error("[FILES] Send failed:", err)
    })
  }

  const handleTypingStart = () => {
    sendSystemMessage({ type: "typing_start" })
  }

  const handleTypingStop = () => {
    sendSystemMessage({ type: "typing_stop" })
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <ChatHeader
        peerName={peerName}
        peerType={peerType}
        connectionStatus={connectionStatus}
        onLeave={handleLeave}
      />

      <DisconnectBanner 
        connectionStatus={connectionStatus}
        onGoBack={handleLeave}
      />

      <MessageList messages={messages} isTyping={isTyping} peerName={peerName} />

      <MessageInput
        onSendMessage={handleSendMessage}
        onFileSelect={handleFileSelect}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        disabled={!isChannelOpen}
      />
    </div>
  )
}
