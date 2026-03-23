import { HugeiconsIcon } from "@hugeicons/react";
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="relative mb-8">
        {/* Soft ambient glow */}
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl scale-[2]" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center border border-border/30 shadow-lg">
          <HugeiconsIcon icon={WifiDisconnected01Icon} className="w-11 h-11 text-muted-foreground/30" />
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
