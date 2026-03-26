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

  return (
    <div
      className={cn(
        "flex w-full mb-1 group/msg relative",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex flex-col max-w-[88%] sm:max-w-[75%]",
        isSent ? "items-end" : "items-start"
      )}>
        <div className="flex items-center gap-1 w-full">
          {isSent && <EmojiPicker align="end" />}

          <div
            className={cn(
              "rounded-2xl px-3 py-2.5 min-w-[200px] space-y-2 select-none transition-transform",
              isSent
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            )}
            onContextMenu={(e) => {
              e.preventDefault()
              setShowPicker(true)
            }}
          >
            {/* ── Section A: Image Preview ── */}
            {file.mimeType.startsWith("image/") && file.status === "complete" && file.objectUrl && (
              <div className="rounded-lg overflow-hidden max-h-40 sm:max-h-48">
                <img
                  src={file.objectUrl}
                  alt={file.name}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation() 
                    window.open(file.objectUrl!, "_blank")
                  }}
                />
              </div>
            )}
            {file.mimeType.startsWith("image/") && file.status === "receiving" && (
              <div className="rounded-lg bg-black/10 h-32 flex items-center justify-center">
                <HugeiconsIcon icon={Image01Icon} size={32} color="currentColor" className="opacity-40" />
              </div>
            )}

            {/* ── Section B: File Info Row ── */}
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  isSent ? "bg-primary-foreground/15" : "bg-background/50"
                )}
              >
                <HugeiconsIcon
                  icon={getFileIconForMime(file.mimeType)}
                  size={20}
                  color="currentColor"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {file.name}
                </p>
                <p
                  className={cn(
                    "text-[11px] mt-0.5",
                    isSent ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                  {formatFileSize(file.size)}
                  {file.status === "sending" && ` · ${file.progress}%`}
                  {file.status === "receiving" && file.progress > 0 && ` · ${file.progress}%`}
                </p>
              </div>

              {(file.status === "sending" || file.status === "receiving") && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={18}
                  color="currentColor"
                  className="animate-spin opacity-70 flex-shrink-0"
                />
              )}
              {file.status === "complete" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDownload()
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    "transition-opacity hover:opacity-70 flex-shrink-0",
                    isSent ? "bg-primary-foreground/15" : "bg-background/50"
                  )}
                  title="Download"
                >
                  <HugeiconsIcon icon={Download01Icon} size={16} color="currentColor" />
                </button>
              )}
            </div>

            {(file.status === "sending" || file.status === "receiving") && (
              <FileProgressBar
                progress={file.progress}
                className={isSent ? "[&>div]:bg-primary-foreground" : ""}
              />
            )}

            <div className={cn("flex items-center gap-2", isSent ? "justify-end" : "justify-between flex-row-reverse")}>
              {!isSent && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {file.status === "sending"   && "Sending..."}
                  {file.status === "receiving" && "Receiving..."}
                  {file.status === "complete"  && "Tap to download"}
                  {file.status === "error"     && "Transfer failed"}
                </span>
              )}
              <span
                className={cn(
                  "text-[10px] opacity-70 whitespace-nowrap",
                  isSent ? "text-primary-foreground" : "text-muted-foreground"
                )}
              >
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
