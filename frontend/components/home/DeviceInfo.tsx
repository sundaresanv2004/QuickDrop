"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon } from "@hugeicons/core-free-icons";
import { useDeviceName } from "@/hooks/useDeviceName";
import { EditNameDialog } from "./EditNameDialog";

export function DeviceInfo() {
    const { name, saveName, randomize, loaded } = useDeviceName();

    return (
        <div className="py-6">
            <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-widest">
                Your Device
            </h2>
            <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-chart-2/5">
                <CardContent className="relative z-10 flex items-center gap-4 p-5">
                    {/* Avatar with pulse glow */}
                    <div className="relative flex items-center justify-center">
                        <div className="absolute -inset-1 rounded-full animate-pulse-glow" />
                        <Avatar className="relative h-13 w-13 border-2 border-primary/30">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                                <HugeiconsIcon icon={ComputerIcon} size={26} />
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-base font-bold truncate">
                                {loaded ? name : "Loading..."}
                            </span>
                            <EditNameDialog
                                currentName={name}
                                onSave={saveName}
                                onRandomize={randomize}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                            </span>
                            Ready to connect
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
