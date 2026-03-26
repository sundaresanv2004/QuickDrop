import { HugeiconsIcon } from "@hugeicons/react";
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full px-6 text-center text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="relative mb-6">
        {/* Soft ambient glow */}
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-background border border-border shadow-sm">
          <HugeiconsIcon icon={WifiDisconnected01Icon} size={32} color="currentColor" className="text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-2xl font-semibold mb-3 text-foreground/50 tracking-tight">
        No devices nearby
      </h3>
      <p className="text-sm max-w-[280px] text-muted-foreground/50 leading-relaxed">
        Make sure other devices are on the same network and have QuickDrop open
      </p>
    </div>
  )
}
