import { Peer } from "@/types/messages"
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon } from "@hugeicons/core-free-icons";

interface PeerBubbleProps {
  peer: Peer;
  onClick: (peerId: string) => void;
}

export default function PeerBubble({ peer, onClick }: PeerBubbleProps) {
  return (
    <button
      onClick={() => onClick(peer.device_id)}
      className="group flex flex-col items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl p-3 transition-transform duration-300 ease-out hover:scale-110 active:scale-95"
    >
      <div className="relative">
        {/* Pulsing ring */}
        <div className="absolute -inset-2 rounded-full border-2 border-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping pointer-events-none" />
        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300 pointer-events-none" />
        {/* Main circle */}
        <div className="relative w-24 h-24 rounded-full bg-secondary/80 backdrop-blur-sm flex items-center justify-center border border-border/50 shadow-lg group-hover:border-primary/40 group-hover:shadow-primary/10 group-hover:shadow-xl transition-all duration-300">
          <HugeiconsIcon
            icon={ComputerIcon}
            className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors duration-300"
          />
        </div>
      </div>
      <span
        className="text-sm font-medium text-foreground/70 group-hover:text-foreground w-28 truncate text-center transition-colors duration-300"
        title={peer.device_name}
      >
        {peer.device_name}
      </span>
    </button>
  )
}
