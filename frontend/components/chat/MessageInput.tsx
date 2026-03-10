import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon } from "@hugeicons/core-free-icons";

interface MessageInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText("");
            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
                textareaRef.current.focus();
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [text]);

    return (
        <div className="flex items-end gap-2 p-4 pt-2 glass-card border-t border-border/40 mt-auto rounded-b-xl z-10 w-full relative">
            <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={disabled}
                className="min-h-[44px] max-h-[120px] resize-none py-3 px-4 bg-background/50 rounded-2xl flex-1 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                rows={1}
            />
            <Button
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                size="icon"
                className="h-11 w-11 rounded-full shrink-0 transition-transform active:scale-95 duration-200"
            >
                <HugeiconsIcon icon={SentIcon} size={20} className="ml-1" />
                <span className="sr-only">Send</span>
            </Button>
        </div>
    );
}
