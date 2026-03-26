"use client"

import { cn } from "@/lib/utils"

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
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-all transform active:scale-95",
        hasMyReaction 
          ? "bg-primary/10 border-primary/30 text-primary" 
          : "bg-muted/50 border-border/30 text-muted-foreground hover:bg-muted"
      )}
    >
      <span className="text-sm">{emoji}</span>
      {userIds.length > 1 && <span>{userIds.length}</span>}
    </button>
  )
}
