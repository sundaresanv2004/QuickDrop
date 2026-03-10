'use client';

import React from 'react';
import { DeviceCard, Device } from "./DeviceCard";

const MOCK_DEVICES: Device[] = [
    { id: '1', name: 'Sundar\'s iPhone', type: 'mobile' },
    { id: '2', name: 'Living Room iMac', type: 'desktop' },
    { id: '3', name: 'iPad Pro', type: 'mobile' },
];

export function DeviceList() {
    const handleConnect = (id: string) => {
        console.log(`Connecting to device ${id}...`);
    };

    return (
        <div className="py-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Discovered Devices</h2>
            <div className="flex flex-col gap-3">
                {MOCK_DEVICES.map(device => (
                    <DeviceCard key={device.id} device={device} onConnect={handleConnect} />
                ))}
            </div>
        </div>
    );
}
