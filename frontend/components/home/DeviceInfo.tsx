import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon } from "@hugeicons/core-free-icons";

export function DeviceInfo() {
    return (
        <div className="py-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Current Device</h2>
            <Card className="bg-primary/5 border-primary/20">
                <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12 border border-primary/20">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                            <HugeiconsIcon icon={ComputerIcon} size={24} />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="text-base font-semibold">My MacBook Pro</span>
                        <span className="text-xs text-muted-foreground">Ready to connect</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
