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
  AlertCircleIcon,
  SmileIcon,
} from "@hugeicons/core-free-icons"
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import ReactionBadge from "./ReactionBadge"
import { Message, MessageContent, MessageFooter, MessageAvatar } from "@/components/ui/message"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bubble, BubbleReactions } from "@/components/ui/bubble"
import { Spinner } from "@/components/ui/spinner"
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
} from "@/components/ui/attachment"

function getFileIconForMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image01Icon
  if (mimeType.startsWith("video/")) return Video01Icon
  if (mimeType.startsWith("audio/")) return MusicNote01Icon
  if (mimeType === "application/pdf") return Pdf01Icon
  return File01Icon
}

function getFileMimeLabel(mimeType: string): string {
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1].toUpperCase()
  if (mimeType.startsWith("video/")) return mimeType.split("/")[1].toUpperCase()
  if (mimeType.startsWith("audio/")) return mimeType.split("/")[1].toUpperCase()
  if (mimeType === "application/pdf") return "PDF"
  if (mimeType === "application/zip") return "ZIP"
  return mimeType.split("/")[1]?.toUpperCase() ?? "FILE"
}

interface FileBubbleProps {
  message: ChatMessage
  peerName: string
  isLastInGroup: boolean
}

export default function FileBubble({ message, peerName, isLastInGroup }: FileBubbleProps) {
  const { sendReaction, myDeviceId } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "file" || !message.file) return null

  const file = message.file
  const isSent = message.direction === "sent"
  const reactions = message.reactions || {}
  const hasReactions = Object.keys(reactions).length > 0

  const handleDownload = async () => {
    let url = file.objectUrl

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

    if (!file.objectUrl && url) {
      setTimeout(() => URL.revokeObjectURL(url!), 1000)
    }
  }

  const handleReaction = (emoji: string) => {
    sendReaction(message.id, emoji)
    setShowPicker(false)
  }

  const emojis = ["👍", "❤️", "😂", "😅", "🙏", "🎉", "😮", "😢", "😡", "🙌", "🔥", "✨", "💯"]

  // Map our transfer status to the Attachment state prop
  let attachmentState: "idle" | "uploading" | "processing" | "error" | "done" = "idle"
  if (file.status === "sending") attachmentState = "uploading"
  else if (file.status === "receiving") attachmentState = "processing"
  else if (file.status === "complete") attachmentState = "done"
  else if (file.status === "error") attachmentState = "error"

  const isInProgress = file.status === "sending" || file.status === "receiving"

  const msgAlign = isSent ? "end" : "start"
  const senderName = isSent ? "Me" : peerName
  const initials = senderName.charAt(0).toUpperCase()

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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("group/msg relative w-full animate-in fade-in slide-in-from-bottom-1 duration-300", hasReactions ? "mb-5" : "mb-2")}>
          <Message align={msgAlign} className="w-full">
            <MessageAvatar className={cn(!isLastInGroup && "opacity-0 invisible pointer-events-none")}>
              <Avatar className="size-8">
                <AvatarFallback className={cn("text-xs font-semibold", isSent ? "bg-primary text-primary-foreground" : "bg-muted")}>{initials}</AvatarFallback>
              </Avatar>
            </MessageAvatar>

            <MessageContent>
              <div className={cn("flex items-center gap-1 w-full", isSent ? "justify-end" : "justify-start")}>
                {isSent && <EmojiPicker align="end" />}

                {/* Bubble wraps the Attachment to get BubbleReactions positioning */}
                <Bubble
                  variant="ghost"
                  align={msgAlign}
                  className={cn("max-w-[85%] sm:max-w-[75%]")}
                >
                  <Attachment
                    state={attachmentState}
                    className="w-full sm:min-w-[280px]"
                  >
                    <AttachmentMedia variant="icon">
                      {/* Show Spinner during transfers; file-type icon otherwise */}
                      {isInProgress
                        ? <Spinner />
                        : <HugeiconsIcon icon={getFileIconForMime(file.mimeType)} className="size-4" />
                      }
                    </AttachmentMedia>

                    <AttachmentContent>
                      <AttachmentTitle>{file.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {getFileMimeLabel(file.mimeType)} · {formatFileSize(file.size)}
                        {isInProgress && file.progress > 0 && ` · ${file.progress}%`}
                        {file.status === "error" && ` · ${file.statusReason ?? "Failed"}`}
                      </AttachmentDescription>
                    </AttachmentContent>

                    {/* Download action — only available once fully received */}
                    {file.status === "complete" && (
                      <AttachmentActions>
                        <AttachmentAction
                          aria-label={`Download ${file.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDownload() }}
                        >
                          <HugeiconsIcon icon={Download01Icon} className="size-4" />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}

                    {/* Full-card trigger for completed files so clicking anywhere downloads */}
                    {file.status === "complete" && (
                      <AttachmentTrigger asChild>
                        <button
                          aria-label={`Download ${file.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDownload() }}
                        />
                      </AttachmentTrigger>
                    )}
                  </Attachment>

                  {/* Reactions cluster — anchored to the Bubble via BubbleReactions */}
                  {hasReactions && (
                    <BubbleReactions side="bottom" align={isSent ? "start" : "end"}>
                      {Object.entries(reactions).map(([emoji, userIds]) => (
                        <ReactionBadge
                          key={emoji}
                          emoji={emoji}
                          userIds={userIds as string[]}
                          myDeviceId={myDeviceId}
                          onClick={handleReaction}
                        />
                      ))}
                    </BubbleReactions>
                  )}
                </Bubble>

                {!isSent && <EmojiPicker align="start" />}
              </div>

              {/* Timestamp + delivery receipt */}
              {isLastInGroup && (
                <MessageFooter className={cn("mt-1 gap-1 opacity-70", isSent ? "justify-end pr-1" : "justify-start pl-1")}>
                  <span className="text-[10px] text-muted-foreground select-none tabular-nums">
                    {formatTimestamp(message.timestamp)}
                  </span>

                  {isSent && file.status === "error" && (
                    <HugeiconsIcon icon={AlertCircleIcon} size={11} className="text-destructive" />
                  )}

                  {!isSent && file.status === "complete" && (
                    <span className="text-[10px] font-semibold uppercase tracking-tight text-muted-foreground">
                      Ready
                    </span>
                  )}
                </MessageFooter>
              )}
            </MessageContent>
          </Message>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl overflow-hidden" collisionPadding={16}>
        <div className="flex flex-row gap-1 overflow-x-auto scrollbar-hide py-2 px-2 border-b border-border/20 mb-1 w-full">
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

        {file.status === "complete" && (
          <ContextMenuItem onClick={() => handleDownload()} className="gap-3 mt-1 cursor-pointer">
            <HugeiconsIcon icon={Download01Icon} size={18} />
            <span>Download</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
