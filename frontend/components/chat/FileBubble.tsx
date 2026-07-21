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
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import ReactionBadge from "./ReactionBadge"
import { Message, MessageContent, MessageFooter, MessageAvatar } from "@/components/ui/message"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  Attachment, 
  AttachmentMedia, 
  AttachmentContent, 
  AttachmentTitle, 
  AttachmentDescription, 
  AttachmentActions, 
  AttachmentAction 
} from "@/components/ui/attachment"

function getFileIconForMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image01Icon
  if (mimeType.startsWith("video/")) return Video01Icon
  if (mimeType.startsWith("audio/")) return MusicNote01Icon
  if (mimeType === "application/pdf") return Pdf01Icon
  return File01Icon
}

interface FileBubbleProps {
  message: ChatMessage
  peerName: string
  isLastInGroup: boolean
}

export default function FileBubble({ message, peerName, isLastInGroup }: FileBubbleProps) {
  const { sendReaction, myDeviceId, acceptLargeFileStream, rejectFile } = useWebRTC()
  const [showPicker, setShowPicker] = useState(false)

  if (message.type !== "file" || !message.file) return null

  const file = message.file
  const isSent = message.direction === "sent"

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

  const handleAcceptStream = async () => {
    try {
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

  let attachmentState: "idle" | "uploading" | "processing" | "done" | "error" = "idle"
  if (file.status === "sending") attachmentState = "uploading"
  if (file.status === "receiving") attachmentState = "processing"
  if (file.status === "complete") attachmentState = "done"
  if (file.status === "error") attachmentState = "error"

  const msgAlign = isSent ? "end" : "start"
  
  const senderName = isSent ? "Me" : peerName
  const initials = senderName.charAt(0).toUpperCase()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group/msg relative mb-2 w-full animate-in fade-in slide-in-from-bottom-1 duration-300">
          <Message align={msgAlign} className="w-full">
            <MessageAvatar className={cn(!isLastInGroup && "opacity-0 invisible pointer-events-none")}>
              <Avatar className="size-8">
                <AvatarFallback className={cn("text-xs font-semibold", isSent ? "bg-primary text-primary-foreground" : "bg-muted")}>{initials}</AvatarFallback>
              </Avatar>
            </MessageAvatar>
            <MessageContent>
              <div className={cn("flex items-center gap-1 w-full", isSent ? "justify-end" : "justify-start")}>
                {isSent && <EmojiPicker align="end" />}
                
                <div className={cn("max-w-[85%] sm:max-w-[75%] flex flex-col items-end relative", Object.keys(reactions).length > 0 && "mb-4")}>
                  <Attachment state={attachmentState} className="w-full sm:min-w-[280px]">
                    <AttachmentMedia variant="icon">
                      <HugeiconsIcon icon={getFileIconForMime(file.mimeType)} size={24} />
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{file.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {formatFileSize(file.size)}
                        {(file.status === "sending" || file.status === "receiving") && file.progress > 0 && ` · ${file.progress}%`}
                      </AttachmentDescription>
                    </AttachmentContent>
                    
                    {file.status === "complete" && !file.streamingMode && (
                      <AttachmentActions>
                        <AttachmentAction onClick={(e) => { e.stopPropagation(); handleDownload() }}>
                          <HugeiconsIcon icon={Download01Icon} size={16} />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}
                  </Attachment>

                  {/* Progress Bar Override for finer control */}
                  {(file.status === "sending" || file.status === "receiving") && file.progress > 0 && (
                    <FileProgressBar progress={file.progress} className={cn("w-full mt-1.5 h-1")} />
                  )}

                  {/* Large File Action Row (Waiting for Approval) */}
                  {!isSent && file.status === "receiving" && file.streamingMode && file.progress === 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t mt-2 w-full px-2 pb-2">
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
                          className="h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] font-bold min-w-[100px]"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={12} className="mr-1" />
                          DECLINE
                        </Button>
                        <Button
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleAcceptStream() }}
                          variant="outline"
                          className="h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 text-[10px] font-bold min-w-[100px]"
                        >
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className="mr-1" />
                          ACCEPT & SAVE
                        </Button>
                      </div>
                    </div>
                  )}

                  {Object.keys(reactions).length > 0 && (
                    <div className={cn("flex flex-wrap gap-1 mt-2 w-full", isSent ? "justify-start" : "justify-end")}>
                      {Object.entries(reactions).map(([emoji, userIds]) => (
                        <ReactionBadge
                          key={emoji}
                          emoji={emoji}
                          userIds={userIds as string[]}
                          myDeviceId={myDeviceId}
                          onClick={handleReaction}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {!isSent && <EmojiPicker align="start" />}
              </div>
              
              <MessageFooter className={cn("mt-1 opacity-70", isSent ? "justify-end" : "justify-start")}>
                <span className="text-[9px] select-none whitespace-nowrap font-medium">
                  {formatTimestamp(message.timestamp)}
                </span>
                
                {isSent && (
                  <div className="flex items-center ml-1">
                    {file.status === "sending" && (
                      <HugeiconsIcon icon={Tick01Icon} size={12} />
                    )}
                    {file.status === "complete" && (
                      <HugeiconsIcon icon={TickDouble01Icon} size={13} />
                    )}
                    {file.status === "error" && (
                      <HugeiconsIcon icon={AlertCircleIcon} size={11} className="text-destructive saturate-150" />
                    )}
                  </div>
                )}
                
                {!isSent && file.status === "complete" && !file.streamingMode && (
                  <span className="text-[9px] font-bold uppercase tracking-tight ml-1">
                    Ready to Download
                  </span>
                )}
                {!isSent && file.status === "complete" && file.streamingMode && (
                  <span className="text-[9px] font-bold uppercase tracking-tight ml-1">
                    Saved to Disk
                  </span>
                )}
              </MessageFooter>
            </MessageContent>
          </Message>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl overflow-hidden" collisionPadding={16}>
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
            className="gap-3 mt-1 cursor-pointer"
          >
            <HugeiconsIcon icon={Download01Icon} size={18} />
            <span>Download</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
