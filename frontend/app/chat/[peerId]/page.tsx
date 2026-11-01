"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useWebRTC } from "@/context/WebRTCContext"
import ChatHeader from "@/components/chat/ChatHeader"
import MessageList from "@/components/chat/MessageList"
import MessageInput from "@/components/chat/MessageInput"
import TypingIndicator from "@/components/chat/TypingIndicator"
import DisconnectBanner from "@/components/chat/DisconnectBanner"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

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
  // Freeze the peerId at mount so stale closures in cleanup effects
  // never accidentally reset a newer session.
  const frozenPeerId = useRef(peerId)
  // Cache the peer name so it never reverts to 'Unknown Device'
  // when the peer is removed from the list on disconnect.
  const cachedPeerName = useRef<string>("Unknown Device")
  const cachedPeerType = useRef<string>("unknown")

  const [isDragging, setIsDragging] = useState(false)

  // ─── Guard: redirect if no active connection ───
  useEffect(() => {
    if (
      connectionStatus !== "connected" &&
      connectionStatus !== "connecting" &&
      connectionStatus !== "reconnecting" &&
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
    setActiveChatPeerId(frozenPeerId.current);

    return () => {
      resetConnection(frozenPeerId.current);
    };
  }, [setActiveChatPeerId, resetConnection]);

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
  // Update the cache whenever the peer is visible in the list
  if (peer?.device_name) cachedPeerName.current = peer.device_name
  if (peer?.device_type) cachedPeerType.current = peer.device_type
  const peerName = cachedPeerName.current
  const peerType = cachedPeerType.current

  const isChannelOpen = chatChannelOpen && connectionStatus === "connected"

  const handleLeave = () => {
    hasCleanedUp.current = true
    sendSystemMessage({ type: "bye" })
    resetConnection()
    router.replace("/")
  }

  const handleSendMessage = (content: string, preview?: any) => {
    sendChatMessage(content, preview)
  }

  const handleFilesSelect = (files: File[]) => {
    files.forEach(file => {
      if (file.size > 250 * 1024 * 1024) {
        toast.error(`Cannot transfer ${file.name}. File size exceeds the 250 MB limit.`);
        return;
      }
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if we are leaving the actual container window, not just a child element
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (!isChannelOpen) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      handleFilesSelect(files)
    }
  }

  return (
    <div 
      className="flex flex-col h-[100dvh] bg-background relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && isChannelOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl m-4 pointer-events-none transition-all">
          <div className="flex flex-col items-center gap-4 text-primary animate-in zoom-in-95 duration-200">
            <div className="p-4 rounded-full bg-primary/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p className="text-xl font-semibold tracking-tight">Drop files to send</p>
          </div>
        </div>
      )}

      <ChatHeader
        peerName={peerName}
        peerType={peerType}
        connectionStatus={connectionStatus}
        onLeave={handleLeave}
      />

      <DisconnectBanner
        connectionStatus={connectionStatus}
        peerName={peerName}
        onGoBack={handleLeave}
      />

      <MessageList messages={messages} peerName={peerName} />

      <TypingIndicator isTyping={isTyping} peerName={peerName} />

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
