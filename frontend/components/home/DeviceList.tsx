"use client";

import React from "react";
import { AnimatedDeviceCard, Device } from "./AnimatedDeviceCard";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevices } from "@/hooks/useDevices";
import { useDeviceName } from "@/hooks/useDeviceName";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { ConnectionRequestModal } from "./ConnectionRequestModal";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function DeviceList() {
    const { devices, isConnected } = useDevices();
    const { name: currentDeviceName } = useDeviceName();
    const router = useRouter();
    const hasRedirectedRef = useRef<Set<string>>(new Set());
    const {
        incomingRequest,
        connectedPeers,
        pendingRequests,
        sendConnectionRequest,
        acceptConnectionRequest,
        rejectConnectionRequest,
    } = usePeerConnection(currentDeviceName);

    // Filter out our own device from the list
    const otherDevices = devices.filter(d => d.name !== currentDeviceName);

    // Auto-open chat when a peer becomes connected
    useEffect(() => {
        if (connectedPeers.length > 0) {
            const latestPeerId = connectedPeers[connectedPeers.length - 1];
            // Prevent duplicate routing calls if React triple renders
            if (!hasRedirectedRef.current.has(latestPeerId)) {
                hasRedirectedRef.current.add(latestPeerId);
                router.push(`/chat/${latestPeerId}`);
            }
        }
    }, [connectedPeers, router]);

    // We consider it "scanning" if we haven't connected yet, 
    // or if we are connected but see 0 other devices (to keep the scanning illusion alive briefly)
    const isScanning = !isConnected;

    const handleConnectTrigger = (id: string) => {
        if (connectedPeers.includes(id)) {
            // If already connected, push to their dedicated page route
            router.push(`/chat/${id}`);
        } else {
            // Otherwise, initiate request
            sendConnectionRequest(id);
        }
    };

    return (
        <div className="py-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Discovered Devices
                </h2>
                {isScanning ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in-up">
                        <Spinner className="h-3 w-3" />
                        Scanning...
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground animate-fade-in-up">
                        {otherDevices.length} found
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-3">
                {isScanning && (
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

                {!isScanning && otherDevices.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-xl border-border animate-fade-in-up">
                        No other devices found on the network.
                        <br />
                        Make sure QuickDrop is open on another device.
                    </div>
                )}

                {!isScanning &&
                    otherDevices.map((device, index) => (
                        <AnimatedDeviceCard
                            key={device.id}
                            // Map the backend device (id, name) to the AnimatedDeviceCard props (needs type)
                            // We default to mobile for now as we don't track type in Phase 1
                            device={{ ...device, type: "mobile" }}
                            index={index}
                            isConnected={connectedPeers.includes(device.id)}
                            isPending={pendingRequests.includes(device.id)}
                            onConnect={handleConnectTrigger}
                        />
                    ))}
            </div>

            <ConnectionRequestModal
                isOpen={!!incomingRequest}
                senderId={incomingRequest?.senderId || ""}
                senderName={devices.find(d => d.id === incomingRequest?.senderId)?.name}
                onAccept={acceptConnectionRequest}
                onReject={rejectConnectionRequest}
            />
        </div>
    );
}
