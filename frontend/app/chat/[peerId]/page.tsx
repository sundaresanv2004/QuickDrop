"use client"

import { useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import ChatHeader from "@/components/chat/ChatHeader"
import MessageList from "@/components/chat/MessageList"
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

  // Ref to track if we already cleaned up via handleLeave
  const hasCleanedUp = useRef(false)

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

  // ─── Phase 5: Navigation Guards ───

  useEffect(() => {
    // Push a duplicate state so the first back press 
    // hits our interceptor, not the previous page
    window.history.pushState({ quickdrop: true }, "", window.location.href)
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Native back button was pressed
      // Treat exactly the same as clicking our UI Back button
      console.warn("[NAV] Native back button intercepted — cleaning up")

      // Send graceful bye
      sendSystemMessage({ type: "bye" })

      // Reset all connection and chat state
      resetConnection()

      // Navigate to discovery page
      // Use replace so /chat doesn't stay in history
      router.replace("/")
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [sendSystemMessage, resetConnection, router])

  // Cleanup on component unmount (catches all other nav paths)
  useEffect(() => {
    return () => {
      if (!hasCleanedUp.current) {
        console.warn("[NAV] Chat page unmounted without handleLeave — cleaning up")
        sendSystemMessage({ type: "bye" })
        resetConnection()
      }
    }
  }, [sendSystemMessage, resetConnection])

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
    hasCleanedUp.current = true
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
