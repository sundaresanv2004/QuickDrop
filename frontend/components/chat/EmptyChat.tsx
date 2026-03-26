"use client"

import { HugeiconsIcon } from '@hugeicons/react'
import { Message01Icon } from '@hugeicons/core-free-icons'

export default function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
      <HugeiconsIcon icon={Message01Icon} className="w-12 h-12" />
      <h3 className="text-lg font-medium">No messages yet</h3>
      <p className="text-sm">Send a message or drop a file to get started</p>
    </div>
  )
}
