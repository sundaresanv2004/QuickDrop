import { Badge } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react";
import { Wifi01Icon, WifiDisconnected01Icon } from "@hugeicons/core-free-icons";

interface StatusBarProps {
  isConnected: boolean;
  appName: string;
}

export default function StatusBar({ isConnected, appName }: StatusBarProps) {
  return (
    <header className="w-full flex items-center justify-between px-6 py-4 backdrop-blur-md bg-background/60 border-b border-border/40 sticky top-0 z-50">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <HugeiconsIcon icon={Wifi01Icon} className="w-4.5 h-4.5 text-primary" />
        </div>
        <span className="text-lg font-bold tracking-tight">{appName}</span>
      </div>

      <Badge
        variant={isConnected ? "default" : "secondary"}
        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300"
      >
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
        </span>
        {isConnected ? "Ready" : "Connecting..."}
      </Badge>
    </header>
  )
}
