"use client"
import React, { useState } from "react"
import { ChatMessage } from "@/types/chat"
import { cn, formatFileSize, formatTimestamp } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
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
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import FileProgressBar from "./FileProgressBar"
import { useWebRTC } from "@/context/WebRTCContext"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import ReactionBadge from "./ReactionBadge"
import { useWebRTCBridge } from "@/hooks/useWebRTCBridge"

function getFileIconForMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image01Icon
  if (mimeType.startsWith("video/")) return Video01Icon
  if (mimeType.startsWith("audio/")) return MusicNote01Icon
  if (mimeType === "application/pdf") return Pdf01Icon
  return File01Icon
}

interface FileBubbleProps {
  message: ChatMessage
}

export default function FileBubble({ message }: FileBubbleProps) {
  const { sendReaction, myDeviceId, acceptLargeFileStream, rejectFile } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "file" || !message.file) return null

  const file = message.file
  const isSent = message.direction === "sent"

  const handleDownload = async () => {
    let url = file.objectUrl

    // If we are in Low-RAM mode, fetch the full blob on-demand
    if (!url) {
      try {
        const { webRTCManager } = await import("@/lib/webrtc/WebRTCManager")
        url = await webRTCManager.getDownloadUrl(file.fileId, file.mimeType)
      } catch (err) {
        console.error("[FILES] Failed to fetch full file for download:", err)
        return
      }
    }

    if (!url) return

    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    a.click()

    // Clean up temporary URL after a short delay if we generated it on-demand
    if (!file.objectUrl && url) {
      setTimeout(() => URL.revokeObjectURL(url!), 1000)
    }
  }

  const handleReaction = (emoji: string) => {
    sendReaction(message.id, emoji)
    setShowPicker(false)
  }

  const handleAcceptStream = async () => {
    try {
      // Direct call so we don't lose the secure "User Gesture" context
      // required by the browser's window.showSaveFilePicker API
      // @ts-ignore
      acceptLargeFileStream?.(file.fileId)
    } catch (err: any) {
      console.error("[FILES] Stream setup failed:", err)
    }
  }

  const reactions = message.reactions || {}
  const emojis = ["👍", "❤️", "😂", "😅", "🙏", "🎉", "😮", "😢", "😡", "🙌", "🔥", "✨", "💯"]

  const EmojiPicker = ({ align }: { align: "start" | "end" }) => (
    <Popover open={showPicker} onOpenChange={setShowPicker}>
      <PopoverTrigger asChild>
        <button className="opacity-0 group-hover/msg:opacity-100 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-all cursor-pointer flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={SmileIcon} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align={align}
        collisionPadding={16}
        sideOffset={8}
        className="w-[215px] px-1 py-0.5 rounded-full bg-popover/90 backdrop-blur-xl border-border/50 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex flex-row gap-0.5 overflow-x-auto scrollbar-hide py-2 px-1">
          {emojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className={cn(
                "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90 shrink-0",
                myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )

  const isImage = file.mimeType.startsWith("image/")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("flex w-full mb-1 group/msg relative", isSent ? "justify-end" : "justify-start")}>
          <div className={cn("flex flex-col max-w-[80%] sm:max-w-[65%]", isSent ? "items-end" : "items-start")}>
            <div className="flex items-center gap-1 w-full">
              {isSent && <EmojiPicker align="end" />}
              <div
                className={cn(
                  "rounded-xl px-2.5 py-2 min-w-[180px] space-y-1.5 select-none transition-transform shadow-sm",
                  isSent ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                )}
              >

                <div
                  className={cn(
                    "flex items-center gap-2",
                    !isSent && file.status === "complete" && !file.streamingMode ? "cursor-pointer" : ""
                  )}
                  onClick={(e) => {
                    if (!isSent && file.status === "complete" && !file.streamingMode) {
                      e.stopPropagation();
                      handleDownload();
                    }
                  }}
                >
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
                    <div className="flex items-center gap-1.5 font-mono">
                      <HugeiconsIcon icon={Loading03Icon} size={15} color="currentColor" className="animate-spin opacity-60" />
                    </div>
                  )}
                  {file.status === "complete" && !file.streamingMode && (
                    <Button
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDownload() }}
                      size="icon"
                      variant="ghost"
                      className={cn("w-7 h-7 rounded-lg", isSent ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10")}
                      title="Download"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={14} color="currentColor" />
                    </Button>
                  )}
                </div>

                {(file.status === "sending" || file.status === "receiving") && file.progress > 0 && (
                  <FileProgressBar progress={file.progress} className={cn("mt-1.5 h-1 bg-black/10 dark:bg-white/10", isSent ? "[&>div]:bg-primary-foreground bg-black/20" : "")} />
                )}

                {/* Large File Action Row (Waiting for Approval) */}
                {!isSent && file.status === "receiving" && file.streamingMode && file.progress === 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/10 mt-2">
                    <p className="text-[10px] opacity-60 italic text-center leading-tight">
                      Size: {formatFileSize(file.size)}. Start stream?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          rejectFile?.(file.fileId);
                        }}
                        variant="ghost"
                        className="h-8 rounded-lg bg-red-400/10 hover:bg-red-400/20 text-red-400 text-[10px] font-bold border border-red-500/20 min-w-[100px]"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} />
                        DECLINE
                      </Button>
                      <Button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleAcceptStream() }}
                        variant="outline"
                        className="h-8 rounded-lg bg-green-400/10 hover:bg-green-400/20 text-green-400 text-[10px] font-bold shadow-lg border border-green-500/30 min-w-[100px]"
                      >
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} />
                        ACCEPT & SAVE
                      </Button>
                    </div>
                  </div>
                )}

                {/* Time & Status Row */}
                <div className={cn("flex items-center gap-1.5 mt-1", isSent ? "justify-end" : "justify-between")}>
                  <span className={cn("text-[8px] font-medium opacity-50", isSent ? "text-primary-foreground" : "text-muted-foreground")}>
                    {formatTimestamp(message.timestamp)}
                  </span>

                  {!isSent && file.status === "complete" && !file.streamingMode && (
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight opacity-70">
                      Ready to Download
                    </span>
                  )}
                  {!isSent && file.status === "complete" && file.streamingMode && (
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight opacity-70">
                      Saved to Disk
                    </span>
                  )}

                  {isSent && (
                    <div className="flex items-center opacity-70">
                      {isSent && file.status === "sending" && (
                        <HugeiconsIcon icon={Tick01Icon} size={12} className={cn(isSent ? "text-primary-foreground" : "text-muted-foreground")} />
                      )}
                      {isSent && file.status === "complete" && (
                        <HugeiconsIcon icon={TickDouble01Icon} size={13} className={cn(isSent ? "text-primary-foreground" : "text-muted-foreground")} />
                      )}
                      {file.status === "error" && (
                        <HugeiconsIcon icon={AlertCircleIcon} size={11} className="text-destructive saturate-150" />
                      )}
                    </div>
                  )}
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
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl overflow-hidden" collisionPadding={16}>
        {/* Inline Mobile-Safe Emoji Row */}
        <div className="flex flex-row gap-1 overflow-x-auto scrollbar-hide py-2 px-2 border-b border-border/20 mb-1 w-full relative">
          {emojis.map(emoji => (
            <ContextMenuItem
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className={cn(
                "w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-accent transition-all transform hover:scale-125 active:scale-90 shrink-0 p-0 focus:bg-accent cursor-pointer",
                myDeviceId && reactions[emoji]?.includes(myDeviceId) ? "bg-accent" : ""
              )}
            >
              {emoji}
            </ContextMenuItem>
          ))}
        </div>

        {file.status === "complete" && !file.streamingMode && (
          <ContextMenuItem
            onClick={() => handleDownload()}
            className="gap-3 mt-1"
          >
            <HugeiconsIcon icon={Download01Icon} size={18} />
            <span>Download</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
