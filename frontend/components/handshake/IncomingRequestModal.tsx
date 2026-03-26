"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWebRTC } from "@/context/WebRTCContext"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserCheck01Icon, Wifi01Icon } from "@hugeicons/core-free-icons"

export default function IncomingRequestModal() {
  const { connectionStatus, incomingRequest, acceptRequest, rejectRequest } = useWebRTC()

  const isOpen = connectionStatus === "receiving" && !!incomingRequest

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background p-6 pb-10 sm:pb-6 shadow-xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
             <HugeiconsIcon icon={Wifi01Icon} className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Incoming Request</h2>
          <p className="text-balance text-muted-foreground/80 pt-2 text-sm">
            <span className="font-semibold text-foreground">{incomingRequest?.peerName || "A nearby device"}</span> wants to share files with you.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6">
          <Button 
            variant="outline" 
            onClick={rejectRequest} 
            className="w-full sm:w-auto flex-1 rounded-full h-11 transition-colors hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
          >
            Decline
          </Button>
          <Button 
            onClick={acceptRequest} 
            className="w-full sm:w-auto flex-1 rounded-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}

