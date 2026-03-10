"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "quickdrop-device-name";
const DEFAULT_NAME = "My Device";

const ADJECTIVES = [
    "Swift", "Silent", "Cosmic", "Turbo", "Stealth",
    "Neon", "Shadow", "Quantum", "Pixel", "Blaze",
    "Frost", "Thunder", "Hyper", "Nova", "Zen",
];

const NOUNS = [
    "Falcon", "Phoenix", "Panther", "Dragon", "Wolf",
    "Vortex", "Nebula", "Titan", "Spark", "Orbit",
    "Pulse", "Arrow", "Cipher", "Fusion", "Bolt",
];

function generateRandomName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
}

export function useDeviceName() {
    const [name, setName] = useState(DEFAULT_NAME);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setName(stored);
        setLoaded(true);
    }, []);

    const saveName = useCallback((newName: string) => {
        const trimmed = newName.trim() || DEFAULT_NAME;
        setName(trimmed);
        localStorage.setItem(STORAGE_KEY, trimmed);
    }, []);

    const randomize = useCallback(() => {
        const random = generateRandomName();
        setName(random);
        localStorage.setItem(STORAGE_KEY, random);
        return random;
    }, []);

    return { name, saveName, randomize, loaded };
}
