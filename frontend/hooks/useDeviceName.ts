"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "quickdrop-device-name";

function getDefaultDeviceName(): string {
    if (typeof window === "undefined") return "My Device";

    const ua = window.navigator.userAgent;
    if (/Mac OS X/.test(ua)) return "MacBook";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    if (/Windows NT/.test(ua)) return "Windows PC";
    if (/Android/.test(ua)) return "Android Device";
    if (/Linux/.test(ua)) return "Linux PC";

    return "My Device";
}

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
    const [name, setName] = useState("");
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setName(stored);
        } else {
            const defaultName = getDefaultDeviceName();
            setName(defaultName);
            localStorage.setItem(STORAGE_KEY, defaultName);
        }
        setLoaded(true);
    }, []);

    const saveName = useCallback((newName: string, e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
        }
        const fallback = getDefaultDeviceName();
        const trimmed = newName.trim() || fallback;
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
