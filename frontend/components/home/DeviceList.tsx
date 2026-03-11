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
    const { devices, publicChats, isConnected } = useDevices();
    const { name: currentDeviceName } = useDeviceName();
    const router = useRouter();
    const hasRedirectedRef = useRef<Set<string>>(new Set());
    const {
        incomingRequest,
        connectedPeers,
        pendingRequests,
        activeTargetId,
        sendConnectionRequest,
        acceptConnectionRequest,
        rejectConnectionRequest,
        joinPublicChat,
    } = usePeerConnection(currentDeviceName);

    // Filter out our own device from the list
    const otherDevices = devices.filter(d => d.name !== currentDeviceName);

    // Auto-open chat when a chat is formed
    useEffect(() => {
        if (activeTargetId) {
            // Prevent duplicate routing calls if React triple renders
            if (!hasRedirectedRef.current.has(activeTargetId)) {
                hasRedirectedRef.current.add(activeTargetId);
                router.push(`/chat/${activeTargetId}`);
            }
        }
    }, [activeTargetId, router]);

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
                            device={{ ...device, type: "mobile" }}
                            index={index}
                            isConnected={connectedPeers.includes(device.id)}
                            isPending={pendingRequests.includes(device.id)}
                            onConnect={() => handleConnectTrigger(device.id)}
                        />
                    ))}

                {/* Render joinable Public Chats */}
                {!isScanning && publicChats.length > 0 && (
                    <div className="mt-6 mb-2">
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                            Public Rooms
                        </h2>
                        <div className="flex flex-col gap-3">
                            {publicChats.map((chat, i) => (
                                <div key={chat.id} 
                                    className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm animate-fade-in-up transition-all hover:bg-muted/30"
                                    style={{ animationDelay: `${(otherDevices.length + i) * 100}ms` }}
                                >
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">{chat.admin_name}&apos;s Room</span>
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">
                                                Public
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground mt-0.5">
                                            {chat.participant_count} {chat.participant_count === 1 ? 'member' : 'members'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => joinPublicChat(chat.id)}
                                        disabled={pendingRequests.includes(chat.id)}
                                        className="text-xs font-medium px-4 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {pendingRequests.includes(chat.id) ? "Requesting..." : "Join"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <ConnectionRequestModal
                isOpen={!!incomingRequest}
                senderId={incomingRequest?.senderId || ""}
                senderName={incomingRequest?.isPublicJoin ? "Someone (Public Join)" : devices.find(d => d.id === incomingRequest?.senderId)?.name}
                onAccept={acceptConnectionRequest}
                onReject={rejectConnectionRequest}
            />
        </div>
    );
}
