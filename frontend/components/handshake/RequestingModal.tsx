"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWebRTC } from "@/context/WebRTCContext"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

export default function RequestingModal() {
  const { status: connectionStatus, targetPeerId, peers, cancelRequest } = useWebRTC()

  const targetPeer = peers.find(p => p.device_id === targetPeerId)
  const isOpen = connectionStatus === "requesting"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancelRequest() }}>
      <DialogContent showCloseButton={false} className="max-w-[320px] p-6 gap-0">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <HugeiconsIcon icon={Loading03Icon} size={32} color="currentColor" className="animate-spin text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">Connecting...</DialogTitle>
          <p className="text-balance text-muted-foreground/80 pt-2 text-sm">
            Waiting for <span className="font-semibold text-foreground">{targetPeer?.device_name || "the other device"}</span> to accept your request.
          </p>
        </div>

        <div className="flex flex-col items-center mt-6">
          <Button 
            variant="outline" 
            onClick={cancelRequest} 
            className="w-full rounded-full h-11 transition-colors hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
