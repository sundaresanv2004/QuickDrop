import { Badge } from "@/components/ui/badge"

interface StatusBarProps {
  isConnected: boolean;
}

export default function StatusBar({ isConnected }: StatusBarProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Badge variant={isConnected ? "info" : "destructive"} className="flex items-center gap-2 px-3 py-1 text-xs">
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${isConnected ? "bg-sky-500" : "bg-red-500"}`} />
        </span>
        {isConnected ? "Ready" : "Connecting..."}
      </Badge>
    </div>
  )
}

