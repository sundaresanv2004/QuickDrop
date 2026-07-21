"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface ReactionBadgeProps {
  emoji: string;
  userIds: string[];
  myDeviceId: string | null;
  onClick: (emoji: string) => void;
}

export default function ReactionBadge({ emoji, userIds, myDeviceId, onClick }: ReactionBadgeProps) {
  const hasMyReaction = myDeviceId && userIds.includes(myDeviceId)

  return (
    <button
      onClick={() => onClick(emoji)}
      className="transition-transform active:scale-95 group focus:outline-none"
    >
      <Badge 
        variant={hasMyReaction ? "default" : "secondary"} 
        className={cn(
          "flex items-center gap-1 px-1.5 py-0 cursor-pointer group-hover:opacity-80 rounded-full h-6 border-none",
          hasMyReaction ? "" : "bg-muted"
        )}
      >
        <span className="text-[11px] leading-none">{emoji}</span>
        {userIds.length > 1 && <span className="text-[10px] tabular-nums font-medium leading-none">{userIds.length}</span>}
      </Badge>
    </button>
  )
}
