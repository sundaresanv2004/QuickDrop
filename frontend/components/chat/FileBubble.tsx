"use client"

import { ChatMessage } from "@/types/chat"
import { cn, formatFileSize, formatTimestamp } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Image01Icon,
  Video01Icon,
  MusicNote01Icon,
  Pdf01Icon,
  File01Icon,
  Download01Icon,
  Loading03Icon,
  AlertCircleIcon,
  SmileIcon,
  Tick01Icon,
  TickDouble01Icon,
} from "@hugeicons/core-free-icons"
import FileProgressBar from "./FileProgressBar"
import { useWebRTC } from "@/context/WebRTCContext"
import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import ReactionBadge from "./ReactionBadge"

function getFileIconForMime(mimeType: string) {
  if (mimeType.startsWith("image/"))  return Image01Icon
  if (mimeType.startsWith("video/"))  return Video01Icon
  if (mimeType.startsWith("audio/"))  return MusicNote01Icon
  if (mimeType === "application/pdf") return Pdf01Icon
  return File01Icon
}

interface FileBubbleProps {
  message: ChatMessage
}

export default function FileBubble({ message }: FileBubbleProps) {
  const { sendReaction, myDeviceId } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "file" || !message.file) return null

  const file   = message.file
  const isSent = message.direction === "sent"

  const handleDownload = () => {
    if (!file.objectUrl) return
    const a    = document.createElement("a")
    a.href     = file.objectUrl
    a.download = file.name
    a.click()
  }

  const handleReaction = (emoji: string) => {
    sendReaction(message.id, emoji)
    setShowPicker(false)
  }

  const handleAcceptStream = async () => {
    // @ts-ignore
    if (!file.streamingMode || !window.showSaveFilePicker) {
      alert("Disk streaming is not supported on this browser or file.")
      return
    }

    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({ suggestedName: file.name })
      const writable = await handle.createWritable()
      // @ts-ignore
      const { webRTCManager } = await import("@/lib/webrtc/WebRTCManager")
      webRTCManager.acceptLargeFileStream(file.fileId, writable)
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[FILES] User cancelled file picker")
      } else {
        console.error("[FILES] Stream setup failed:", err)
      }
    }
  }

  const reactions = message.reactions || {}
  const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

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
        className="w-auto p-1.5 rounded-full bg-popover/90 backdrop-blur-xl border-border/50 shadow-xl flex flex-row gap-1 animate-in zoom-in-95 duration-200"
      >
        {emojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className={cn(
              "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90",
              myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
            )}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )

  const images = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]
  const isImage = images.includes(file.mimeType)

  return (
    <div className={cn("flex w-full mb-1 group/msg relative", isSent ? "justify-end" : "justify-start")}>
      <div className={cn("flex flex-col max-w-[80%] sm:max-w-[65%]", isSent ? "items-end" : "items-start")}>
        <div className="flex items-center gap-1 w-full">
          {isSent && <EmojiPicker align="end" />}
          <div
            className={cn(
              "rounded-xl px-2.5 py-2 min-w-[180px] space-y-1.5 select-none transition-transform shadow-sm",
              isSent ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
            )}
            onContextMenu={(e) => { e.preventDefault(); setShowPicker(true) }}
          >
            {/* Image Preview - show if we have an objectUrl at any stage */}
            {isImage && file.objectUrl && (
              <div className="rounded-lg overflow-hidden max-h-36 sm:max-h-44 border border-black/5 bg-black/5">
                <img
                  src={file.objectUrl}
                  alt={file.name}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); window.open(file.objectUrl!, "_blank") }}
                />
              </div>
            )}
            {!isSent && isImage && !file.objectUrl && file.status === "receiving" && (
              <div className="rounded-lg bg-black/10 h-28 flex items-center justify-center">
                <HugeiconsIcon icon={Image01Icon} size={24} color="currentColor" className="opacity-40" />
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", isSent ? "bg-primary-foreground/15" : "bg-background/50")}>
                <HugeiconsIcon icon={getFileIconForMime(file.mimeType)} size={18} color="currentColor" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate leading-tight">{file.name}</p>
                <p className={cn("text-[10px] mt-0.5", isSent ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formatFileSize(file.size)}
                  {file.status === "sending" && ` · ${file.progress}%`}
                  {file.status === "receiving" && file.progress > 0 && ` · ${file.progress}%`}
                </p>
              </div>

              {(file.status === "sending" || file.status === "receiving") && (
                <div className="flex items-center gap-1.5">
                  {!isSent && file.status === "receiving" && file.streamingMode && file.progress === 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAcceptStream() }}
                      className="px-2.5 py-1 rounded-md bg-foreground text-background text-[11px] font-bold hover:scale-105 active:scale-95 transition-all flex items-center gap-1 shadow-lg border border-background/20"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={14} />
                      ACCEPT & SAVE
                    </button>
                  )}
                  <HugeiconsIcon icon={Loading03Icon} size={16} color="currentColor" className="animate-spin opacity-70" />
                </div>
              )}
              {file.status === "complete" && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload() }}
                  className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-black/10", isSent ? "bg-primary-foreground/15" : "bg-background/50")}
                  title="Download"
                >
                  <HugeiconsIcon icon={Download01Icon} size={14} color="currentColor" />
                </button>
              )}
            </div>

            {(file.status === "sending" || file.status === "receiving") && (
              <FileProgressBar progress={file.progress} className={cn("h-1", isSent ? "[&>div]:bg-primary-foreground" : "")} />
            )}

            <div className={cn("flex items-center gap-2 mt-1", isSent ? "justify-end" : "justify-between flex-row-reverse")}>
              <div className="flex items-center gap-1.5 opacity-70">
                {file.status === "sending" && (
                  <span className="text-[9px] font-bold uppercase tracking-tight">Sending...</span>
                )}
                {file.status === "receiving" && (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} size={10} className="animate-spin" />
                    <span className="text-[9px] font-bold uppercase tracking-tight">
                      {file.streamingMode && file.progress === 0 ? "Awaiting Approve" : "Receiving..."}
                    </span>
                  </>
                )}
                {file.status === "complete" && (
                  <span className={cn("text-[9px] font-bold uppercase tracking-tight", isSent ? "text-blue-200" : "text-green-500")}>
                    {file.streamingMode ? "Disk Saved" : "Ready"}
                  </span>
                )}
                {file.status === "error" && (
                  <span className="text-[9px] font-bold uppercase tracking-tight text-destructive">Error</span>
                )}
              </div>
              <span className={cn("text-[9px] font-medium opacity-60", isSent ? "text-primary-foreground" : "text-muted-foreground")}>
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
          </div>

          {!isSent && <EmojiPicker align="start" />}
        </div>

        {/* Reaction Display */}
        {Object.keys(reactions).length > 0 && (
          <div className={cn(
            "flex flex-wrap gap-1 mt-1.5 px-1",
            isSent ? "justify-end" : "justify-start"
          )}>
            {Object.entries(reactions).map(([emoji, userIds]) => (
              <ReactionBadge
                key={emoji}
                emoji={emoji}
                userIds={userIds}
                myDeviceId={myDeviceId}
                onClick={handleReaction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
