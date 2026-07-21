"use client"

import { useTheme } from "next-themes"
import { HugeiconsIcon } from '@hugeicons/react'
import { Sun03Icon, Moon02Icon } from '@hugeicons/core-free-icons'

import { Button } from "@/components/ui/button"

export default function SetTheme() {
    const { resolvedTheme, setTheme } = useTheme()

    const toggleTheme = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="relative  hover:cursor-pointer size-9 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            suppressHydrationWarning
        >
            {/* Sun Icon: Visible in light mode, rotates out in dark */}
            <HugeiconsIcon
                icon={Sun03Icon}
                className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
            />

            {/* Moon Icon: Invisible in light mode, rotates in for dark */}
            <HugeiconsIcon
                icon={Moon02Icon}
                className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
            />

            <span className="sr-only">Toggle theme</span>
        </Button>
    )
}
