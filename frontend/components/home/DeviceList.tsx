"use client";

import React, { useState, useEffect } from "react";
import { AnimatedDeviceCard, Device } from "./AnimatedDeviceCard";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

const MOCK_DEVICES: Device[] = [
    { id: "1", name: "Sundar's iPhone", type: "mobile" },
    { id: "2", name: "Living Room iMac", type: "desktop" },
    { id: "3", name: "iPad Pro", type: "mobile" },
];

export function DeviceList() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [scanning, setScanning] = useState(true);

    useEffect(() => {
        // Simulate network scanning delay
        const timer = setTimeout(() => {
            setDevices(MOCK_DEVICES);
            setScanning(false);
        }, 1800);
        return () => clearTimeout(timer);
    }, []);

    const handleConnect = (id: string) => {
        console.log(`Connecting to device ${id}...`);
    };

    return (
        <div className="py-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Discovered Devices
                </h2>
                {scanning && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in-up">
                        <Spinner className="h-3 w-3" />
                        Scanning...
                    </div>
                )}
                {!scanning && (
                    <span className="text-xs text-muted-foreground animate-fade-in-up">
                        {devices.length} found
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-3">
                {scanning && (
                    <div className="flex flex-col gap-3">
                        {[0, 1, 2].map((i) => (
                            <Skeleton
                                key={i}
                                className="h-[72px] rounded-xl"
                                style={{ animationDelay: `${i * 200}ms` }}
                            />
                        ))}
                    </div>
                )}

                {!scanning &&
                    devices.map((device, index) => (
                        <AnimatedDeviceCard
                            key={device.id}
                            device={device}
                            index={index}
                            onConnect={handleConnect}
                        />
                    ))}
            </div>
        </div>
    );
}
