"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";

export interface Device {
    id: string;
    name: string;
    type: "desktop" | "mobile";
}

interface AnimatedDeviceCardProps {
    device: Device;
    index: number;
    onConnect?: (id: string) => void;
}

export function AnimatedDeviceCard({ device, index, onConnect }: AnimatedDeviceCardProps) {
    return (
        <div
            className={`animate-fade-in-up`}
            style={{ animationDelay: `${index * 150 + 300}ms` }}
        >
            <Card className="glass-card group flex flex-row items-center justify-between p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10">
                <div className="flex items-center gap-4">
                    <Avatar className="h-11 w-11 transition-transform duration-300 group-hover:scale-110">
                        <AvatarFallback className="bg-primary/10 text-primary">
                            {device.type === "desktop" ? (
                                <HugeiconsIcon icon={ComputerIcon} size={20} />
                            ) : (
                                <HugeiconsIcon icon={SmartPhone01Icon} size={20} />
                            )}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="font-semibold text-sm">{device.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{device.type}</span>
                    </div>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onConnect?.(device.id)}
                    className="transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95"
                >
                    Connect
                </Button>
            </Card>
        </div>
    );
}
