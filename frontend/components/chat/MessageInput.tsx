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

import { LinkPreview } from "@/types/chat"

interface MessageInputProps {
  onSendMessage: (content: string, preview?: LinkPreview) => void
  onFilesSelect: (files: File[]) => void
  onTypingStart: () => void
  onTypingStop: () => void
  disabled: boolean
}

export default function MessageInput({ 
  onSendMessage, 
  onFilesSelect, 
  onTypingStart,
  onTypingStop,
  disabled 
}: MessageInputProps) {
  const [value, setValue] = useState("")
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const fetchedUrls = useRef<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const isTypingRef = useRef<boolean>(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }

    onSendMessage(value.trim(), preview || undefined)
    setValue("")
    setPreview(null)
    setLoadingPreview(false)
    fetchedUrls.current.clear()
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
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) {
            onFilesSelect(files)
            e.target.value = ""
          }
        }}
      />
      <input
        type="file"
        ref={mediaInputRef}
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) {
            onFilesSelect(files)
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

          // URL Detection Logic
          const urlRegex = /(https?:\/\/[^\s]+)/g
          const match = newValue.match(urlRegex)
          
          if (match && match[0]) {
            const url = match[0]
            if (!fetchedUrls.current.has(url)) {
              if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
              
              previewTimerRef.current = setTimeout(async () => {
                // Check cache first
                const cacheKey = `preview_cache_${url}`
                try {
                  const cached = sessionStorage.getItem(cacheKey)
                  if (cached) {
                    setPreview(JSON.parse(cached))
                    fetchedUrls.current.add(url)
                    return
                  }
                } catch(e) {}

                setLoadingPreview(true)
                try {
                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"
                  const res = await fetch(`${apiUrl}/link-preview?url=${encodeURIComponent(url)}`)
                  
                  // Verification Check: Has the URL been removed while fetching?
                  if (res.ok) {
                    const data = await res.json()
                    
                    // Check again if the URL is still in the input
                    const currentText = (document.getElementById("message-input-area") as HTMLTextAreaElement)?.value || ""
                    if (currentText.includes(url)) {
                      setPreview(data)
                      fetchedUrls.current.add(url)
                      try {
                        sessionStorage.setItem(cacheKey, JSON.stringify(data))
                      } catch(e) {}
                    } else {
                      console.log("[LinkPreview] Input changed, discarding preview.")
                    }
                  } else {
                    console.error(`[LinkPreview] Backend returned ${res.status}: ${res.statusText}`)
                  }
                } catch (err) {
                  console.error("[LinkPreview] Failed to fetch preview:", err)
                } finally {
                  setLoadingPreview(false)
                }
              }, 1000)
            }
          } else {
            if (preview) {
              setPreview(null)
              fetchedUrls.current.clear()
            }
          }

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
        id="message-input-area"
        className="resize-none min-h-[40px] max-h-[120px] flex-1 text-base sm:text-sm"
        inputMode="text"
        enterKeyHint="send"
      />

      {preview && (
        <div className="absolute bottom-full left-0 right-0 p-3 bg-background/80 backdrop-blur-md border-t border-x rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">Link Preview Rendering...</span>
            <button 
              onClick={() => {
                setPreview(null)
                // We don't clear fetchedUrls so it doesn't immediately re-fetch the same link
              }}
              className="text-muted-foreground hover:text-foreground text-xs font-bold bg-muted/50 px-2 py-0.5 rounded-full transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-3 min-w-0">
            {preview.image && (
              <img src={preview.image} alt="" className="w-16 h-16 rounded-xl object-cover border border-border/50 shadow-sm" />
            )}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <h4 className="text-xs font-bold truncate text-foreground/90">{preview.title || "No Title"}</h4>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{preview.description || "No description available."}</p>
            </div>
          </div>
        </div>
      )}

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
