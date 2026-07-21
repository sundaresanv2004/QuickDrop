"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Wifi01Icon } from "@hugeicons/core-free-icons";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full px-6 text-center text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Animated scanning rings */}
      <div className="relative mb-4 flex items-center justify-center w-24 h-24">
        {/* Outer ring — slowest */}
        <div className="absolute w-24 h-24 rounded-full border border-primary/10 animate-ping [animation-duration:3s]" />
        {/* Middle ring */}
        <div className="absolute w-16 h-16 rounded-full border border-primary/15 animate-ping [animation-duration:3s] [animation-delay:1s]" />
        {/* Soft glow */}
        <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full" />
        {/* Icon container */}
        <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-background border border-border/60 shadow-sm z-10">
          <HugeiconsIcon
            icon={Wifi01Icon}
            size={26}
            color="currentColor"
            className="text-primary/50"
          />
        </div>
      </div>

      <h3 className="text-xl font-semibold text-foreground/50 tracking-tight">
        Searching for devices…
      </h3>

      <div className="flex flex-col gap-2 mt-1 text-left max-w-[260px]">
        <p className="text-xs text-muted-foreground/50 text-center leading-relaxed">
          Make sure the other device is on the
          <span className="font-medium text-foreground/40"> same Wi-Fi</span> and
          has <span className="font-medium text-foreground/40">QuickDrop open</span>.
        </p>
      </div>
    </div>
  );
}
