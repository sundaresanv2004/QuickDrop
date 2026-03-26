import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-fit w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap backdrop-blur-md transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // Primary (blue glass)
        default:
          "border-primary/30 bg-primary/15 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
        // Gray glass
        secondary:
          "border-border/60 bg-secondary/60 text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        // Red glass
        destructive:
          "border-red-500/30 bg-red-500/15 text-red-500 dark:text-red-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        // Border only
        outline:
          "border-border/60 bg-background/40 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        // Green glass
        success:
          "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        // Amber glass
        warning:
          "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        // Cyan glass
        info:
          "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-muted",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
