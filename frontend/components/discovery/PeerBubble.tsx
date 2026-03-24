import { Peer } from "@/types/messages"
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon } from "@hugeicons/core-free-icons";

interface PeerBubbleProps {
  peer: Peer;
  onClick: (peerId: string) => void;
  disabled?: boolean;
}

export default function PeerBubble({ peer, onClick, disabled }: PeerBubbleProps) {
  return (
    <button
      onClick={() => onClick(peer.device_id)}
      disabled={disabled}
      className={`group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl p-2 transition-all duration-300 ease-out ${disabled ? "opacity-40 cursor-not-allowed scale-95" : "hover:scale-110 active:scale-95"}`}
    >
      <div className="relative">
        {/* Pulsing discovery ring */}
        <div className="absolute -inset-2 rounded-full border border-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping pointer-events-none" />
        {/* Glow */}
        <div className="absolute -inset-1 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />
        {/* Main circle */}
        <div className="relative w-16 h-16 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center border border-border/30 shadow-md group-hover:border-primary/30 group-hover:shadow-primary/10 group-hover:shadow-xl transition-all duration-300">
          <HugeiconsIcon
            icon={ComputerIcon}
            className="w-7 h-7 text-muted-foreground/60 group-hover:text-primary transition-colors duration-300"
          />
        </div>
      </div>
      <span
        className="text-xs font-medium text-foreground/60 group-hover:text-foreground w-24 truncate text-center transition-colors duration-300"
        title={peer.device_name}
      >
        {peer.device_name}
      </span>
    </button>
  )
}
