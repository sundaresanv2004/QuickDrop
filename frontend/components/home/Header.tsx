import React from "react";
import { Badge } from "@/components/ui/badge";

export function Header() {
  return (
    <header className="flex items-center justify-between py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
          QuickDrop
        </h1>
        <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
          </span>
          Scanning
        </Badge>
      </div>
    </header>
  );
}
