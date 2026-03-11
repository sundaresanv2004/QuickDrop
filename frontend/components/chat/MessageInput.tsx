import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon, Attachment01Icon } from "@hugeicons/core-free-icons";

interface MessageInputProps {
    onSend: (text: string) => void;
    onSendFile: (file: File) => void;
    disabled?: boolean;
}

export function MessageInput({ onSend, onSendFile, disabled }: MessageInputProps) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onSendFile(e.target.files[0]);
            // Reset input so the same file can be selected again
            e.target.value = "";
        }
    };

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
        <div className="flex items-end gap-2 p-3 md:p-4 pt-2 bg-background/60 backdrop-blur-xl border-t border-border/40 mt-auto lg:rounded-b-3xl z-10 w-full relative shrink-0">
            <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
                disabled={disabled}
            />
            <Button
                variant="ghost"
                size="icon"
                className="h-[46px] w-[46px] rounded-full shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all active:scale-95"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
            >
                <HugeiconsIcon icon={Attachment01Icon} size={22} />
                <span className="sr-only">Attach file</span>
            </Button>

            <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={disabled}
                className="min-h-[46px] max-h-[140px] resize-none py-3 px-5 bg-muted/40 backdrop-blur-sm rounded-3xl flex-1 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:bg-muted/60 transition-all text-[15px] leading-relaxed"
                rows={1}
            />
            <Button
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                size="icon"
                className={cn(
                    "h-[46px] w-[46px] rounded-full shrink-0 transition-all duration-300",
                    text.trim() ? "bg-gradient-to-tr from-primary to-purple-600 hover:shadow-lg hover:shadow-primary/30 active:scale-90" : "bg-muted text-muted-foreground"
                )}
            >
                <HugeiconsIcon icon={SentIcon} size={20} className="ml-1" />
                <span className="sr-only">Send</span>
            </Button>
        </div>
    );
}
