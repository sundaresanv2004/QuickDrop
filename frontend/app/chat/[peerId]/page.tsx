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
    status: connectionStatus,
    peers,
    messages,
    isTyping,
    sendChatMessage,
    sendSystemMessage,
    resetConnection,
    sendFile,
    setActiveChatPeerId,
    chatChannelOpen,
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

  // ─── Phase 6: Session Management ───
  useEffect(() => {
    // Mark this peer session as "active" in the Context.
    // This tells the Context to ignore cleanup requests for other IDs.
    setActiveChatPeerId(peerId);

    return () => {
      // When leaving, we tell the Context which session we are ending.
      // If a newer mount has already updated activeChatPeerId, 
      // this cleanup (from the stale mount) will do nothing.
      resetConnection(peerId);
    };
  }, [peerId, setActiveChatPeerId, resetConnection]);

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

  const isChannelOpen = chatChannelOpen && connectionStatus === "connected"

  const handleLeave = () => {
    hasCleanedUp.current = true
    sendSystemMessage({ type: "bye" })
    resetConnection()
    router.replace("/")
  }

  const handleSendMessage = (content: string) => {
    sendChatMessage(content)
  }

  const handleFilesSelect = (files: File[]) => {
    files.forEach(file => {
      sendFile(file).catch(err => {
        console.error(`[FILES] Send failed for ${file.name}:`, err)
      })
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
        onFilesSelect={handleFilesSelect}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        disabled={!isChannelOpen}
      />
    </div>
  )
}
