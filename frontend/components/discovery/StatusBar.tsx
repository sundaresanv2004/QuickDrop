import { Badge } from "@/components/ui/badge"

interface StatusBarProps {
  isConnected: boolean;
}

export default function StatusBar({ isConnected }: StatusBarProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Badge
        variant="outline"
        className={`
          flex items-center gap-2 rounded-full px-1.5 sm:px-4 py-2 text-[10px] sm:text-xs font-medium
          backdrop-blur-2xl border shadow-lg transition-all duration-300
          ${isConnected
            ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:bg-blue-500/10 dark:border-blue-400/20 dark:text-blue-400"
            : "bg-red-500/10 border-red-500/20 text-red-600 dark:bg-red-500/10 dark:border-red-400/20 dark:text-red-400"
          }
        `}
      >
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${isConnected ? "bg-blue-500" : "bg-red-500"}`} />
        </span>
        {isConnected ? "Ready" : "Connecting..."}
      </Badge>
    </div>

  )
}
