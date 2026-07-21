import { Badge } from "@/components/ui/badge"

interface StatusBarProps {
  isConnected: boolean;
}

export default function StatusBar({ isConnected }: StatusBarProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Badge
        variant={isConnected ? "success" : "warning"}
        className="flex items-center gap-1.5 px-3 py-1 text-xs"
      >
        <span className="relative flex size-1.5">
          {isConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span className={`relative inline-flex size-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
        </span>
        {isConnected ? "Ready" : "Connecting..."}
      </Badge>
    </div>
  )
}
