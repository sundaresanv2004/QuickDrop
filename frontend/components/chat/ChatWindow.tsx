import React, { useRef, useEffect } from "react";
import { ChatMessage } from "@/hooks/useChat";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HugeiconsIcon } from "@hugeicons/react";
import { LockKeyIcon } from "@hugeicons/core-free-icons";

interface ChatWindowProps {
    targetId: string;
    targetName?: string;
    localDeviceId: string;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    onSendFile: (file: File) => void;
    onClose?: () => void;
}

export function ChatWindow({
    targetId,
    targetName,
    localDeviceId,
    messages,
    onSendMessage,
    onSendFile,
    onClose
}: ChatWindowProps) {
    const scrollEndRef = useRef<HTMLDivElement>(null);
    const displayName = targetName || targetId;

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollEndRef.current) {
            scrollEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    return (
        <div className="flex flex-col h-[500px] w-full max-w-md mx-auto glass-card rounded-2xl overflow-hidden border border-border/40 shadow-xl shadow-primary/5 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/50 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="font-semibold">{displayName}</span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <HugeiconsIcon icon={LockKeyIcon} size={10} />
                            <span>End-to-End Encrypted Peer</span>
                        </div>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors p-2"
                    >
                        Close
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 bg-background/20">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground opacity-60 p-8 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                            <HugeiconsIcon icon={LockKeyIcon} size={24} className="text-primary/70" />
                        </div>
                        <p className="text-sm">
                            Direct connection established.
                        </p>
                        <p className="text-xs">
                            Messages are sent securely peer-to-peer and are not stored on any server.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col justify-end min-h-full pb-2">
                        {messages.map((msg) => (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isOwnMessage={msg.sender === localDeviceId}
                            />
                        ))}
                        <div ref={scrollEndRef} className="h-1" />
                    </div>
                )}
            </ScrollArea>

            {/* Input Area */}
            <MessageInput onSend={onSendMessage} onSendFile={onSendFile} />
        </div>
    );
}
