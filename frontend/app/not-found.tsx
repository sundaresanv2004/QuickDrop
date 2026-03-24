"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-svh bg-background text-foreground overflow-hidden selection:bg-primary/20">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-[0.06]" style={{
        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "32px 32px"
      }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.03] dark:bg-primary/[0.06] blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center max-w-md">
        {/* Glitch-style 404 */}
        <div className="relative">
          <h1 className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter text-foreground/[0.06] select-none">
            404
          </h1>
          <p className="absolute inset-0 flex items-center justify-center text-[120px] sm:text-[160px] font-black leading-none tracking-tighter bg-gradient-to-b from-foreground/80 to-foreground/30 bg-clip-text text-transparent">
            404
          </p>
        </div>

        <div className="flex flex-col gap-2 -mt-4">
          <h2 className="text-xl font-bold text-foreground/90">Page not found</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <Button asChild className="rounded-full px-8 h-11 shadow-lg shadow-primary/20 mt-2">
          <Link href="/">
            Back to QuickDrop
          </Link>
        </Button>
      </div>

      {/* Logo — bottom left */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-300">
        <Image src="/logo.png" alt="QuickDrop" width={28} height={28} className="rounded-md" />
        <span className="text-sm font-bold tracking-tight text-foreground/70">QuickDrop</span>
      </div>
    </main>
  )
}
