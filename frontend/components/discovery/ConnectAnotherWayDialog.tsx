"use client"

import { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle01Icon, Copy01Icon, Share01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useWebRTC } from "@/context/WebRTCContext"
import { buildPairLink, formatCountdown } from "@/lib/pair-link"
import { webRTCManager } from "@/lib/webrtc/WebRTCManager"

const COPIED_CONFIRMATION_MS = 2000
const QR_CODE_SIZE = 192

interface ConnectAnotherWayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ActiveLink {
  url: string
  expiresAt: number
}

export default function ConnectAnotherWayDialog({ open, onOpenChange }: ConnectAnotherWayDialogProps) {
  const { wsConnected } = useWebRTC()
  const [link, setLink] = useState<ActiveLink | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Requests a link while open, and revokes it on close so an unused QR code stops working.
  useEffect(() => {
    if (!open) return

    const unsubscribeLink = webRTCManager.on("pair_link", (token, expiresInSeconds) => {
      setLink({ url: buildPairLink(window.location.origin, token), expiresAt: Date.now() + expiresInSeconds * 1000 })
      setRemainingSeconds(expiresInSeconds)
    })
    const unsubscribeJoined = webRTCManager.on("pair_joined", () => onOpenChange(false))
    if (wsConnected) webRTCManager.createPairLink()

    return () => {
      unsubscribeLink()
      unsubscribeJoined()
      webRTCManager.cancelPairLink()
      setLink(null)
    }
  }, [open, wsConnected, onOpenChange])

  // Replaces an expired code automatically so the dialog is always usable.
  useEffect(() => {
    if (!link) return
    const timer = setInterval(() => {
      const remaining = (link.expiresAt - Date.now()) / 1000
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        setLink(null)
        webRTCManager.createPairLink()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [link])

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_CONFIRMATION_MS)
    } catch {
      toast.error("Couldn't copy the link", { description: "Scan the QR code instead." })
    }
  }

  const shareLink = async () => {
    if (!link) return
    try {
      await navigator.share({ title: "Connect on QuickDrop", url: link.url })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("Couldn't open the share menu", { description: "Copy the link instead." })
      }
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 gap-0 sm:max-w-sm">
        <div className="flex flex-col items-center text-center">
          <DialogTitle className="text-xl font-bold text-foreground">Connect another way</DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground/80 pt-2 text-sm">
            Scan this with the other device&apos;s camera, or send it the link.
          </DialogDescription>
        </div>

        {/* A QR code needs dark modules on a light background to scan, so this stays white in dark mode. */}
        <div className="mt-6 flex justify-center">
          <div
            className="relative flex items-center justify-center rounded-3xl bg-white p-4 shadow-sm ring-1 ring-border/40"
            style={{ width: QR_CODE_SIZE + 32, height: QR_CODE_SIZE + 32 }}
          >
            {link ? (
              <div key={link.url} className="animate-in fade-in zoom-in-95 duration-300">
                <QRCodeSVG
                  value={link.url}
                  size={QR_CODE_SIZE}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#09090b"
                  title="QR code to connect to this device"
                />
              </div>
            ) : (
              <Spinner className="size-6 text-zinc-400" />
            )}
          </div>
        </div>

        <p role="status" className="mt-3 h-4 text-center text-xs text-muted-foreground tabular-nums">
          {link
            ? `Expires in ${formatCountdown(remainingSeconds)} · Works once`
            : wsConnected ? "Creating your code…" : "Waiting for a connection…"}
        </p>

        <div className="mt-5 flex gap-3">
          <Button
            variant="outline"
            disabled={!link}
            onClick={copyLink}
            className="flex-1 rounded-full h-11 border-muted-foreground/20"
          >
            <HugeiconsIcon icon={copied ? CheckmarkCircle01Icon : Copy01Icon} size={16} color="currentColor" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare && (
            <Button disabled={!link} onClick={shareLink} className="flex-1 rounded-full h-11">
              <HugeiconsIcon icon={Share01Icon} size={16} color="currentColor" />
              Share
            </Button>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-muted/50 px-3.5 py-3">
          <HugeiconsIcon icon={UserCheck01Icon} size={16} className="mt-px shrink-0 text-muted-foreground" />
          <p className="text-left text-xs leading-relaxed text-muted-foreground">
            Nothing is shared until one of you sends a request and the other accepts it.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
