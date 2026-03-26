"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWebRTC } from "@/context/WebRTCContext"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

export default function RequestingModal() {
  const { connectionStatus, targetPeerId, peers, cancelRequest } = useWebRTC()

  const targetPeer = peers.find(p => p.device_id === targetPeerId)
  const isOpen = connectionStatus === "requesting"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancelRequest() }}>
      <DialogContent showCloseButton={false} className="max-w-[340px]">
        <DialogHeader className="items-center text-center pt-4">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4 relative">
             <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
             <HugeiconsIcon icon={Loading03Icon} className="w-8 h-8 text-primary/40" />
          </div>
          <DialogTitle className="text-2xl font-bold">Connecting...</DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground/80 pt-2">
            Waiting for <span className="font-semibold text-foreground">{targetPeer?.device_name || "the other device"}</span> to accept your request.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center pb-2">
          <Button variant="outline" onClick={cancelRequest} className="rounded-full px-10 h-11 transition-colors hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
