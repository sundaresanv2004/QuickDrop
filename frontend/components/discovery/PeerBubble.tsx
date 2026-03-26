import { Peer } from "@/types/messages"
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, SmartPhone01Icon, Tablet01Icon } from "@hugeicons/core-free-icons";

export function getDeviceIcon(deviceName: string, deviceType: string = "unknown") {
  const type = (deviceType || "").toLowerCase();
  if (type === "mobile") return SmartPhone01Icon;
  if (type === "tablet") return Tablet01Icon;
  if (type === "desktop") return ComputerIcon;

  const name = (deviceName || "").toLowerCase();
  if (name.includes("iphone") || name.includes("android") || name.includes("phone")) return SmartPhone01Icon;
  if (name.includes("ipad") || name.includes("tablet")) return Tablet01Icon;
  return ComputerIcon;
}

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
      className={`group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl p-2 transition-all duration-300 ease-out active:scale-95 touch-manipulation cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed scale-95" : "hover:scale-110"}`}
    >
      <div className="relative">
        {/* Pulsing discovery ring */}
        <div className="absolute -inset-2 rounded-full border border-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping pointer-events-none" />
        {/* Glow */}
        <div className="absolute -inset-1 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />
        {/* Main circle */}
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center border border-border/30 shadow-md group-hover:border-primary/30 group-hover:shadow-primary/10 group-hover:shadow-xl transition-all duration-300">
          <HugeiconsIcon
            icon={getDeviceIcon(peer.device_name, peer.device_type)}
            className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground/60 group-hover:text-primary transition-colors duration-300"
          />
        </div>
      </div>
      <span
        className="text-xs font-medium text-foreground/60 group-hover:text-foreground max-w-[130px] truncate text-center transition-colors duration-300 px-1"
        title={peer.device_name}
      >
        {peer.device_name}
      </span>
    </button>
  )
}
