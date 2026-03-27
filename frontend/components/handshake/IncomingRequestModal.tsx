"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWebRTC } from "@/context/WebRTCContext"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserCheck01Icon, Wifi01Icon } from "@hugeicons/core-free-icons"

export default function IncomingRequestModal() {
  const { status: connectionStatus, incomingRequest, acceptRequest, rejectRequest } = useWebRTC()

  const isOpen = connectionStatus === "receiving" && !!incomingRequest

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) rejectRequest() }}>
      <DialogContent showCloseButton={false} className="max-w-[340px] p-6 gap-0">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
             <HugeiconsIcon icon={Wifi01Icon} className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">Incoming Request</DialogTitle>
          <p className="text-balance text-muted-foreground/80 pt-2 text-sm">
            <span className="font-semibold text-foreground">{incomingRequest?.peerName || "A nearby device"}</span> wants to share files with you.
          </p>
        </div>

        <div className="flex flex-row gap-3 mt-8">
          <Button 
            variant="outline" 
            onClick={rejectRequest} 
            className="flex-1 rounded-full h-11 transition-colors hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 border-muted-foreground/20"
          >
            Decline
          </Button>
          <Button 
            onClick={acceptRequest} 
            className="flex-1 rounded-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

