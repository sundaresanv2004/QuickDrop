"use client";

import React from "react";

export function RadarPulse() {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            {/* Ring 1 */}
            <div className="absolute h-24 w-24 rounded-full border border-primary/30 animate-radar-ping" />
            {/* Ring 2 — offset */}
            <div className="absolute h-24 w-24 rounded-full border border-primary/20 animate-radar-ping delay-1" style={{ animationDelay: "0.7s" }} />
            {/* Ring 3 — offset */}
            <div className="absolute h-24 w-24 rounded-full border border-primary/10 animate-radar-ping delay-2" style={{ animationDelay: "1.4s" }} />
        </div>
    );
}