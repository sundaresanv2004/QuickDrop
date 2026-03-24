"use client"

import { useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[QuickDrop Error]", error)
  }, [error])

  return (
    <main className="relative flex flex-col items-center justify-center min-h-svh bg-background text-foreground overflow-hidden selection:bg-primary/20">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-[0.06]" style={{
        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "32px 32px"
      }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-destructive/[0.04] dark:bg-destructive/[0.08] blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center max-w-md">
        {/* Error icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
            <svg className="w-10 h-10 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-foreground/90">Something went wrong</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An unexpected error occurred. Please try again or return to the home page.
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <Button 
            variant="outline" 
            onClick={reset} 
            className="rounded-full px-6 h-11"
          >
            Try again
          </Button>
          <Button 
            asChild
            className="rounded-full px-6 h-11 shadow-lg shadow-primary/20"
          >
            <a href="/">Back to QuickDrop</a>
          </Button>
        </div>
      </div>

      {/* Logo — bottom left */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-300">
        <Image src="/logo.png" alt="QuickDrop" width={28} height={28} className="rounded-md" />
        <span className="text-sm font-bold tracking-tight text-foreground/70">QuickDrop</span>
      </div>
    </main>
  )
}
