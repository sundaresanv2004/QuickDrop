"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWebRTC } from "@/context/WebRTCContext"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserCheck01Icon, Wifi01Icon } from "@hugeicons/core-free-icons"

export default function IncomingRequestModal() {
  const { connectionStatus, incomingRequest, acceptRequest, rejectRequest } = useWebRTC()

  const isOpen = connectionStatus === "receiving" && !!incomingRequest

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) rejectRequest() }}>
      <DialogContent showCloseButton={false} className="max-w-[340px]">
        <DialogHeader className="items-center text-center pt-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
             <HugeiconsIcon icon={Wifi01Icon} className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold">Incoming Request</DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground/80 pt-2">
            <span className="font-semibold text-foreground">{incomingRequest?.peerName || "A nearby device"}</span> wants to share files with you.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-4 pb-2">
          <Button 
            variant="outline" 
            onClick={rejectRequest} 
            className="flex-1 rounded-full h-11 transition-colors hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 order-2 sm:order-1"
          >
            Decline
          </Button>
          <Button 
            onClick={acceptRequest} 
            className="flex-1 rounded-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 order-1 sm:order-2"
          >
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
