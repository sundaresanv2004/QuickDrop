"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPeerManager } from "@/lib/webrtc/peerManager";

export interface ChatMessage {
    id: string;
    sender: string;
    text?: string;
    timestamp: number;
    file?: {
        name: string;
        size: number;
        type: string;
        url?: string;
        progress?: number;
    };
}

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export function useChat(localDeviceId: string | null) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Track incoming file chunks
    const incomingFileId = useRef<string | null>(null);
    const incomingChunks = useRef<ArrayBuffer[]>([]);
    const incomingMetadata = useRef<any>(null);

    useEffect(() => {
        const peerManager = getPeerManager();

        const unsubscribe = peerManager.onMessage((targetId, messageRaw) => {
            if (messageRaw instanceof ArrayBuffer) {
                // Incoming file chunk
                if (incomingFileId.current) {
                    incomingChunks.current.push(messageRaw);

                    // Optimistically update progress
                    const receivedSize = incomingChunks.current.length * CHUNK_SIZE;
                    const totalSize = incomingMetadata.current.size;
                    const progress = Math.min(Math.round((receivedSize / totalSize) * 100), 99);

                    setMessages(prev => prev.map(m =>
                        m.id === incomingFileId.current
                            ? { ...m, file: { ...m.file!, progress } }
                            : m
                    ));
                }
                return;
            }

            try {
                const data = JSON.parse(messageRaw as string);

                if (data.type === "chat-message") {
                    const newMsg: ChatMessage = {
                        id: crypto.randomUUID(),
                        sender: data.sender || targetId,
                        text: data.message,
                        timestamp: data.timestamp || Date.now(),
                    };
                    setMessages((prev) => [...prev, newMsg]);
                }
                else if (data.type === "file-start") {
                    incomingFileId.current = data.fileId;
                    incomingMetadata.current = data;
                    incomingChunks.current = [];

                    const newMsg: ChatMessage = {
                        id: data.fileId,
                        sender: data.sender || targetId,
                        timestamp: Date.now(),
                        file: {
                            name: data.fileName,
                            size: data.fileSize,
                            type: data.fileType,
                            progress: 0,
                        }
                    };
                    setMessages((prev) => [...prev, newMsg]);
                }
                else if (data.type === "file-end") {
                    if (incomingFileId.current === data.fileId) {
                        const blob = new Blob(incomingChunks.current, { type: incomingMetadata.current.fileType });
                        const url = URL.createObjectURL(blob);

                        setMessages(prev => prev.map(m =>
                            m.id === data.fileId
                                ? { ...m, file: { ...m.file!, progress: 100, url } }
                                : m
                        ));

                        incomingFileId.current = null;
                        incomingChunks.current = [];
                        incomingMetadata.current = null;
                    }
                }
            } catch (error) {
                console.error("Failed to parse incoming data channel message:", error);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const sendMessage = useCallback((targetId: string, text: string) => {
        if (!localDeviceId) {
            console.error("Cannot send message: Local device ID is unknown.");
            return false;
        }

        const payload = {
            type: "chat-message",
            message: text,
            sender: localDeviceId,
            timestamp: Date.now(),
        };

        const success = getPeerManager().sendData(targetId, JSON.stringify(payload));

        if (success) {
            // Optimistically append the message to our own local state
            const sentMsg: ChatMessage = {
                id: crypto.randomUUID(),
                sender: localDeviceId,
                text,
                timestamp: payload.timestamp,
            };
            setMessages((prev) => [...prev, sentMsg]);
        }

        return success;
    }, [localDeviceId]);

    const sendFile = useCallback(async (targetId: string, file: File) => {
        if (!localDeviceId) return false;

        const fileId = crypto.randomUUID();
        const msg: ChatMessage = {
            id: fileId,
            sender: localDeviceId,
            timestamp: Date.now(),
            file: {
                name: file.name,
                size: file.size,
                type: file.type,
                progress: 0,
            }
        };

        // 1. Set initial message in UI
        setMessages(prev => [...prev, msg]);

        // 2. Send Start Metadata
        getPeerManager().sendData(targetId, JSON.stringify({
            type: "file-start",
            fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            sender: localDeviceId
        }));

        // 3. Read File and Send Chunks
        const arrayBuffer = await file.arrayBuffer();
        let offset = 0;

        const sendNextChunk = () => {
            if (offset < arrayBuffer.byteLength) {
                const slice = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
                getPeerManager().sendData(targetId, slice);
                offset += CHUNK_SIZE;

                // Update UI progress
                const progress = Math.min(Math.round((offset / file.size) * 100), 99);
                setMessages(prev => prev.map(m => m.id === fileId ? { ...m, file: { ...m.file!, progress } } : m));

                // Yield to event loop to avoid blocking main thread completely on huge files
                setTimeout(sendNextChunk, 0);
            } else {
                // 4. Send End Metadata
                getPeerManager().sendData(targetId, JSON.stringify({
                    type: "file-end",
                    fileId
                }));

                // Update UI to 100% and provide local URL
                const url = URL.createObjectURL(file);
                setMessages(prev => prev.map(m => m.id === fileId ? { ...m, file: { ...m.file!, progress: 100, url } } : m));
            }
        };

        sendNextChunk();
        return true;
    }, [localDeviceId]);

    return {
        messages,
        sendMessage,
        sendFile,
    };
}
