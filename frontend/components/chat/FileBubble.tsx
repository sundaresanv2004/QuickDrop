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
  Cancel01Icon,
  Share01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons"
import { useWebRTC } from "@/context/WebRTCContext"
import { getDeviceType } from "@/lib/device"
import { canShareFile, downloadFile, shareFile } from "@/lib/transfer/storage/save"
import { toast } from "sonner"
import FileProgressBar from "./FileProgressBar"
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
  const { sendReaction, myDeviceId, acceptFile, declineFile, cancelTransfer, getReceivedFile } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "file" || !message.file) return null

  const file = message.file
  const isSent = message.direction === "sent"
  const reactions = message.reactions || {}
  const hasReactions = Object.keys(reactions).length > 0

  // The finished file is ready immediately, so the browser still counts this as
  // a direct tap, which iPhones require for both saving and sharing.
  const receivedFile = !isSent && file.status === "complete" ? getReceivedFile(file.fileId) : null
  const canSave = !!receivedFile && !file.savedToDevice
  const canShare =
    canSave &&
    ["mobile", "tablet"].includes(getDeviceType()) &&
    canShareFile(receivedFile, file.name, file.mimeType)

  const handleDownload = () => {
    if (receivedFile) downloadFile(receivedFile, file.name)
  }

  const handleShare = async () => {
    if (!receivedFile) return
    try {
      await shareFile(receivedFile, file.name, file.mimeType)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("Couldn't open the share menu", { description: "Use the download button instead." })
      }
    }
  }

  const handleReaction = (emoji: string) => {
    sendReaction(message.id, emoji)
    setShowPicker(false)
  }

  const emojis = ["👍", "❤️", "😂", "😅", "🙏", "🎉", "😮", "😢", "😡", "🙌", "🔥", "✨", "💯"]

  // Map our transfer status to the Attachment state prop
  let attachmentState: "idle" | "uploading" | "processing" | "error" | "done" = "idle"
  if (file.status === "sending" || file.status === "waiting") attachmentState = "uploading"
  else if (file.status === "receiving" || file.status === "verifying") attachmentState = "processing"
  else if (file.status === "complete") attachmentState = "done"
  else if (file.status === "error") attachmentState = "error"

  const isInProgress = ["waiting", "sending", "receiving", "verifying"].includes(file.status)
  const showProgress = ["sending", "receiving", "verifying"].includes(file.status)
  const isAwaitingAccept = file.status === "awaiting_accept"
  const fileSummary = `${getFileMimeLabel(file.mimeType)} · ${formatFileSize(file.size)}`

  let statusText = fileSummary
  if (file.status === "waiting") statusText = `${formatFileSize(file.size)} · Waiting for ${peerName}`
  else if (file.status === "verifying") statusText = `${formatFileSize(file.size)} · Checking file ${file.progress}%`
  else if (showProgress) statusText = `${formatFileSize(file.size)} · ${file.progress}%`
  else if (file.savedToDevice) statusText = `${formatFileSize(file.size)} · Saved to your device`
  else if (isSent && file.status === "complete") statusText = `${fileSummary} · Sent`

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
                      <AttachmentDescription className={cn(file.status === "error" && "whitespace-normal")}>
                        {file.status === "error" ? (file.statusReason ?? "Failed") : statusText}
                      </AttachmentDescription>
                      {showProgress && <FileProgressBar progress={file.progress} className="mt-1.5" />}
                    </AttachmentContent>

                    {(file.status === "waiting" || file.status === "sending" || file.status === "receiving") && (
                      <AttachmentActions>
                        <AttachmentAction
                          aria-label={`Cancel ${file.name}`}
                          onClick={(e) => { e.stopPropagation(); cancelTransfer(file.fileId) }}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}

                    {/* Save actions — only available once fully received and checked */}
                    {canSave && (
                      <AttachmentActions>
                        {canShare && (
                          <AttachmentAction
                            aria-label={`Share ${file.name}`}
                            onClick={(e) => { e.stopPropagation(); void handleShare() }}
                          >
                            <HugeiconsIcon icon={Share01Icon} className="size-4" />
                          </AttachmentAction>
                        )}
                        <AttachmentAction
                          aria-label={`Download ${file.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDownload() }}
                        >
                          <HugeiconsIcon icon={Download01Icon} className="size-4" />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}

                    {file.savedToDevice && (
                      <AttachmentActions>
                        <span className="flex size-8 items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />
                        </span>
                      </AttachmentActions>
                    )}

                    {/* Full-card trigger for received files so clicking anywhere downloads */}
                    {canSave && !canShare && (
                      <AttachmentTrigger asChild>
                        <button
                          aria-label={`Download ${file.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDownload() }}
                        />
                      </AttachmentTrigger>
                    )}
                  </Attachment>

                  {isAwaitingAccept && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => declineFile(file.fileId)}
                        className="flex-1 rounded-full border-muted-foreground/20 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
                      >
                        Decline
                      </Button>
                      <Button size="sm" onClick={() => void acceptFile(file.fileId)} className="flex-1 rounded-full">
                        Accept
                      </Button>
                    </div>
                  )}

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

                  {file.status === "complete" && (
                    <span className="text-[10px] font-semibold uppercase tracking-tight text-muted-foreground">
                      {isSent ? "Sent" : file.savedToDevice ? "Saved" : "Ready"}
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

        {canSave && (
          <ContextMenuItem onClick={() => handleDownload()} className="gap-3 mt-1 cursor-pointer">
            <HugeiconsIcon icon={Download01Icon} size={18} />
            <span>Download</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
