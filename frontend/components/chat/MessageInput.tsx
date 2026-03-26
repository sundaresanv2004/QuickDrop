"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from '@hugeicons/react'
import { AttachmentIcon, SentIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 text-muted-foreground hover:text-primary"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <HugeiconsIcon icon={AttachmentIcon} className="w-5 h-5 sm:w-5 sm:h-5" color="currentColor" />
      </Button>
      <input
        type="file"
        ref={fileInputRef}
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
