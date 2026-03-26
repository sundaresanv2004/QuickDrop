"use client"

import { useRef, useState } from "react"
import { HugeiconsIcon } from '@hugeicons/react'
import { Attachment01Icon, SentIcon } from '@hugeicons/core-free-icons'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface MessageInputProps {
  onSendMessage: (content: string) => void
  onFileSelect: (file: File) => void
  disabled: boolean
}

export default function MessageInput({ onSendMessage, onFileSelect, disabled }: MessageInputProps) {
  const [value, setValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if (value.trim() === "") return
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
    <div className="flex items-end gap-2 px-4 py-3 border-t bg-background">
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
      >
        <HugeiconsIcon icon={Attachment01Icon} className="size-5" />
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
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        className="resize-none min-h-[40px] max-h-[120px] flex-1"
      />

      <Button
        variant="default"
        size="icon"
        disabled={value.trim() === "" || disabled}
        onClick={handleSend}
      >
        <HugeiconsIcon icon={SentIcon} className="size-5" />
      </Button>
    </div>
  )
}
