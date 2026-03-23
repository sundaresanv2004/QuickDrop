import { HugeiconsIcon } from "@hugeicons/react";
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full bg-muted/30 blur-2xl scale-150" />
        <div className="relative w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center">
          <HugeiconsIcon icon={WifiDisconnected01Icon} className="w-10 h-10 text-muted-foreground/40" />
        </div>
      </div>
      <h3 className="text-xl font-semibold mb-2 text-foreground/60 tracking-tight">
        No devices nearby
      </h3>
      <p className="text-sm max-w-[260px] text-muted-foreground/60 leading-relaxed">
        Make sure other devices are on the same network and have QuickDrop open
      </p>
    </div>
  )
}
