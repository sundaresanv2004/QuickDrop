"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConnectionRequestModalProps {
    isOpen: boolean;
    senderId: string;
    senderName?: string;
    onAccept: (e: React.MouseEvent) => void;
    onReject: (e?: React.MouseEvent) => void;
}

export function ConnectionRequestModal({
    isOpen,
    senderId,
    senderName,
    onAccept,
    onReject,
}: ConnectionRequestModalProps) {
    const displayName = senderName || senderId;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onReject(); }}>
            <DialogContent className="sm:max-w-md glass-card border-none bg-background/60 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle>Incoming Connection Request</DialogTitle>
                    <DialogDescription>
                        {displayName} wants to connect with you. Do you accept?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex space-x-2 sm:space-x-4">
                    <Button type="button" variant="outline" onClick={(e) => onReject(e)} className="w-full sm:w-auto">
                        Reject
                    </Button>
                    <Button type="button" onClick={(e) => onAccept(e)} className="w-full sm:w-auto">
                        Accept
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
