import React from 'react';
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";

export interface Device {
    id: string;
    name: string;
    type: 'desktop' | 'mobile';
}

interface DeviceCardProps {
    device: Device;
    onConnect?: (id: string) => void;
}

export function DeviceCard({ device, onConnect }: DeviceCardProps) {
    return (
        <Card className="flex flex-row items-center justify-between p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                        {device.type === 'desktop' ? <HugeiconsIcon icon={ComputerIcon} size={20} /> : <HugeiconsIcon icon={SmartPhone01Icon} size={20} />}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <span className="font-semibold text-sm">{device.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{device.type}</span>
                </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onConnect?.(device.id)}>
                Connect
            </Button>
        </Card>
    );
}
