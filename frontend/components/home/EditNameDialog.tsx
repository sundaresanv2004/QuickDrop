"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShuffleIcon, PencilEdit01Icon } from "@hugeicons/core-free-icons";

interface EditNameDialogProps {
    currentName: string;
    onSave: (name: string) => void;
    onRandomize: () => string;
}

export function EditNameDialog({ currentName, onSave, onRandomize }: EditNameDialogProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(currentName);

    useEffect(() => {
        if (open) setDraft(currentName);
    }, [open, currentName]);

    const handleSave = () => {
        onSave(draft);
        setOpen(false);
    };

    const handleRandomize = () => {
        const newName = onRandomize();
        setDraft(newName);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-8 w-8 rounded-full bg-muted text-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="Edit device name"
                >
                    <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Edit Device Name</DialogTitle>
                    <DialogDescription>
                        Choose a name for your device on the network.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-4">
                    <div className="flex gap-2">
                        <Input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Enter device name"
                            onKeyDown={(e) => e.key === "Enter" && handleSave()}
                            autoFocus
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleRandomize}
                            title="Generate random name"
                            className="shrink-0"
                        >
                            <HugeiconsIcon icon={ShuffleIcon} size={16} />
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
