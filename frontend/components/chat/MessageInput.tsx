"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from '@hugeicons/react'
import { AttachmentIcon, SentIcon, File01Icon, Image01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface MessageInputProps {
  onSendMessage: (content: string) => void
  onFileSelect: (file: File) => void
  onTypingStart: () => void
  onTypingStop: () => void
  disabled: boolean
}

export default function MessageInput({ 
  onSendMessage, 
  onFileSelect, 
  onTypingStart,
  onTypingStop,
  disabled 
}: MessageInputProps) {
  const [value, setValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const isTypingRef = useRef<boolean>(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
      }
    }
  }, [])

  const handleSend = () => {
    if (value.trim() === "") return

    // Clear typing state when message is sent
    if (isTypingRef.current) {
      isTypingRef.current = false
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = null
      }
      onTypingStop()
    }

    onSendMessage(value.trim())
    setValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 px-3 sm:px-4 py-3 border-t bg-background sticky bottom-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 text-muted-foreground hover:text-primary rounded-full transition-transform active:scale-95"
            disabled={disabled}
          >
            <HugeiconsIcon icon={AttachmentIcon} className="w-5 h-5 sm:w-5.5 sm:h-5.5 -rotate-45" color="currentColor" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="mb-2 min-w-[200px] rounded-2xl bg-popover/90 backdrop-blur-xl border-border/50 shadow-2xl p-1.5">
          <DropdownMenuItem 
            className="flex items-center gap-3 p-2.5 cursor-pointer focus:bg-accent/50 rounded-xl transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <HugeiconsIcon icon={File01Icon} size={20} strokeWidth={2.5} />
            </div>
            <span className="font-medium text-foreground/80">File</span>
          </DropdownMenuItem>

          <DropdownMenuItem 
            className="flex items-center gap-3 p-2.5 cursor-pointer focus:bg-accent/50 rounded-xl transition-colors"
            onClick={() => mediaInputRef.current?.click()}
          >
            <div className="w-9 h-9 rounded-xl bg-sky-400 flex items-center justify-center text-white shadow-sm shadow-sky-400/20">
              <HugeiconsIcon icon={Image01Icon} size={20} strokeWidth={2.5} />
            </div>
            <span className="font-medium text-foreground/80">Photos and videos</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        type="file"
        ref={fileInputRef}
        accept="*/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onFileSelect(file)
            e.target.value = ""
          }
        }}
      />
      <input
        type="file"
        ref={mediaInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onFileSelect(file)
            e.target.value = ""
          }
        }}
      />

      <Textarea
        placeholder="Type a message..."
        value={value}
        onChange={(e) => {
          const newValue = e.target.value
          setValue(newValue)

          // Edge case 1: field is empty or only whitespace
          if (!newValue.trim()) {
            if (isTypingRef.current) {
              isTypingRef.current = false
              if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current)
                typingTimerRef.current = null
              }
              onTypingStop()
            }
            return
          }

          // Send typing_start only once per burst
          if (!isTypingRef.current) {
            isTypingRef.current = true
            onTypingStart()
          }

          // Reset the inactivity timer on every keystroke
          if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current)
          }
          typingTimerRef.current = setTimeout(() => {
            isTypingRef.current = false
            typingTimerRef.current = null
            onTypingStop()
          }, 1500)
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        className="resize-none min-h-[40px] max-h-[120px] flex-1 text-base sm:text-sm"
        inputMode="text"
        enterKeyHint="send"
      />

      <Button
        variant="default"
        size="icon"
        className="h-11 w-11 sm:h-9 sm:w-9"
        disabled={value.trim() === "" || disabled}
        onClick={handleSend}
      >
        <HugeiconsIcon icon={SentIcon} className="w-5 h-5 sm:w-4.5 sm:h-4.5" color="currentColor" />
      </Button>
    </div>
  )
}
