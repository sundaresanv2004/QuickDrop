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
    isAdmin: boolean;
    chatMode: "private" | "public";
    onChangeMode: (mode: "private" | "public") => void;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    onSendFile: (file: File) => void;
    onClose?: () => void;
}

export function ChatWindow({
    targetId,
    targetName,
    localDeviceId,
    isAdmin,
    chatMode,
    onChangeMode,
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
        <div className="flex flex-col h-full w-full lg:max-w-5xl mx-auto lg:glass-card lg:border lg:border-border/40 lg:shadow-2xl lg:shadow-primary/10 lg:rounded-3xl overflow-hidden animate-fade-in-up relative bg-background">
            
            {/* Ambient Background Glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 blur-[120px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-border/40 bg-background/60 backdrop-blur-xl z-20 sticky top-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary/80 to-purple-600/80 flex items-center justify-center text-white shadow-lg shadow-primary/20">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-lg leading-tight tracking-tight">{displayName}</span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium mt-0.5">
                            <HugeiconsIcon icon={LockKeyIcon} size={12} className="text-emerald-500" />
                            <span className="text-emerald-500/90">E2E Encrypted Connection</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Admin Room Toggle */}
                    {isAdmin && (
                        <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-full border border-border/50">
                            <button
                                onClick={() => onChangeMode("private")}
                                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                                    chatMode === "private" 
                                    ? "bg-background text-foreground shadow-sm shadow-black/5" 
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Private
                            </button>
                            <button
                                onClick={() => onChangeMode("public")}
                                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                                    chatMode === "public" 
                                    ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Public
                            </button>
                        </div>
                    )}
                    
                    {/* Badge for Non-Admins */}
                    {!isAdmin && chatMode === "public" && (
                         <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Public Room
                         </span>
                    )}

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 px-4 py-2 rounded-full transition-all active:scale-95"
                        >
                            Disconnect
                        </button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 px-2 lg:px-6 bg-transparent z-10">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground opacity-60 p-8 space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/20 to-purple-500/20 flex items-center justify-center mb-4 shadow-inner ring-1 ring-white/10">
                            <HugeiconsIcon icon={LockKeyIcon} size={28} className="text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground/90">
                            Secure Connection Established
                        </h3>
                        <p className="text-sm max-w-[250px] leading-relaxed text-muted-foreground mt-1">
                            Messages and files are sent directly peer-to-peer. Nothing is stored on our servers.
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
