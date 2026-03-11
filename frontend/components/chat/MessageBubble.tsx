import React from "react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/hooks/useChat";
import { HugeiconsIcon } from "@hugeicons/react";
import { DocumentAttachmentIcon, Download01Icon } from "@hugeicons/core-free-icons";

interface MessageBubbleProps {
    message: ChatMessage;
    isOwnMessage: boolean;
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
    const timeString = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const isUploading = isOwnMessage && message.file && message.file.progress !== undefined && message.file.progress < 100;
    const isDownloading = !isOwnMessage && message.file && message.file.progress !== undefined && message.file.progress < 100;

    return (
        <div
            className={cn(
                "flex w-full mb-4 animate-fade-in-up",
                isOwnMessage ? "justify-end" : "justify-start"
            )}
        >
            <div
                className={cn(
                    "flex flex-col max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl shadow-sm transition-all hover:shadow-md",
                    isOwnMessage
                        ? "bg-gradient-to-tr from-primary to-purple-600 text-white rounded-tr-sm shadow-primary/20"
                        : "bg-secondary/60 backdrop-blur-md text-secondary-foreground rounded-tl-sm border border-border/30 shadow-black/5"
                )}
            >
                {!isOwnMessage && (
                    <span className="text-[10px] font-bold opacity-60 mb-1">
                        {message.sender}
                    </span>
                )}

                {message.file && (
                    <div className={cn(
                        "flex flex-col gap-2 p-2 rounded-xl mb-1 mt-1 bg-background/20",
                        isOwnMessage ? "bg-black/10" : "bg-white/10"
                    )}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background/30 backdrop-blur-sm">
                                <HugeiconsIcon icon={DocumentAttachmentIcon} size={24} />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-sm font-medium truncate">{message.file.name}</span>
                                <span className="text-[10px] opacity-70 border-b-0">
                                    {(message.file.size / 1024 / 1024).toFixed(2)} MB • {message.file.type || 'Unknown'}
                                </span>
                            </div>
                            {message.file.url ? (
                                <a
                                    href={message.file.url}
                                    download={message.file.name}
                                    className="p-2 ml-2 rounded-full hover:bg-background/40 transition-colors"
                                    title="Download File"
                                >
                                    <HugeiconsIcon icon={Download01Icon} size={20} />
                                </a>
                            ) : null}
                        </div>

                        {(isUploading || isDownloading) && (
                            <div className="w-full h-1.5 bg-background/30 rounded-full overflow-hidden mt-1">
                                <div
                                    className="h-full bg-foreground/60 transition-all duration-300 rounded-full"
                                    style={{ width: `${message.file.progress || 0}%` }}
                                />
                            </div>
                        )}
                        {(isUploading || isDownloading) && (
                            <span className="text-[10px] text-right w-full opacity-70">
                                {isUploading ? 'Sending...' : 'Receiving...'} {message.file.progress}%
                            </span>
                        )}
                    </div>
                )}

                {message.text && (
                    <p className="text-[15px] break-words whitespace-pre-wrap leading-relaxed">
                        {message.text}
                    </p>
                )}
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
