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
} from "@hugeicons/core-free-icons"
import FileProgressBar from "./FileProgressBar"

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

  return (
    <div
      className={cn(
        "flex w-full mb-1",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-3 py-2.5 max-w-[75%] min-w-[220px] space-y-2",
          isSent
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {/* ── Section A: Image Preview ── */}
        {file.mimeType.startsWith("image/") && file.status === "complete" && file.objectUrl && (
          <div className="rounded-lg overflow-hidden max-h-48">
            <img
              src={file.objectUrl}
              alt={file.name}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => window.open(file.objectUrl!, "_blank")}
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
          {/* File type icon */}
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

          {/* File name + size */}
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

          {/* Action icon — right side */}
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
              onClick={handleDownload}
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
          {file.status === "error" && (
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={18}
              color="currentColor"
              className="opacity-70 flex-shrink-0 text-destructive"
            />
          )}
        </div>

        {/* ── Section C: Progress Bar ── */}
        {(file.status === "sending" || file.status === "receiving") && (
          <FileProgressBar
            progress={file.progress}
            className={isSent ? "[&>div]:bg-primary-foreground" : ""}
          />
        )}

        {/* ── Section D: Status + Timestamp ── */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[10px]",
              isSent ? "text-primary-foreground/60" : "text-muted-foreground"
            )}
          >
            {file.status === "sending"   && "Sending..."}
            {file.status === "receiving" && "Receiving..."}
            {file.status === "complete"  && "Tap to download"}
            {file.status === "error"     && "Transfer failed"}
          </span>
          <span
            className={cn(
              "text-[10px]",
              isSent ? "text-primary-foreground/60" : "text-muted-foreground"
            )}
          >
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  )
}
