import React from "react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/hooks/useChat";

interface MessageBubbleProps {
    message: ChatMessage;
    isOwnMessage: boolean;
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
    const timeString = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <div
            className={cn(
                "flex w-full mb-4 animate-fade-in-up",
                isOwnMessage ? "justify-end" : "justify-start"
            )}
        >
            <div
                className={cn(
                    "flex flex-col max-w-[75%] px-4 py-2 rounded-2xl",
                    isOwnMessage
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-secondary text-secondary-foreground rounded-tl-sm glass-card"
                )}
            >
                {!isOwnMessage && (
                    <span className="text-[10px] font-bold opacity-60 mb-1">
                        {message.sender}
                    </span>
                )}
                <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">
                    {message.text}
                </p>
                <div
                    className={cn(
                        "text-[10px] mt-1 text-right",
                        isOwnMessage ? "opacity-80" : "opacity-50"
                    )}
                >
                    {timeString}
                </div>
            </div>
        </div>
    );
}
