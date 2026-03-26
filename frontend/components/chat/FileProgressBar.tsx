"use client"

import { cn } from "@/lib/utils"

interface FileProgressBarProps {
  progress: number
  className?: string
}

export default function FileProgressBar({ progress, className }: FileProgressBarProps) {
  return (
    <div className={cn("w-full bg-muted rounded-full h-1.5", className)}>
      <div
        className="bg-primary h-1.5 rounded-full transition-all duration-200"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}
