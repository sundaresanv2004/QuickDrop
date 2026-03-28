"use client"

import { LinkPreview } from "@/types/chat"
import { ExternalLink } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@/lib/utils"

interface LinkEmbedProps {
  preview: LinkPreview
  isSent: boolean
}

export default function LinkEmbed({ preview, isSent }: LinkEmbedProps) {
  const { url, title, description, image } = preview

  // If there's no metadata, just show a minimal link indicator
  if (!title && !description && !image) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 text-xs font-medium underline underline-offset-4 opacity-80 hover:opacity-100 transition-opacity",
          isSent ? "text-primary-foreground" : "text-primary"
        )}
      >
        <HugeiconsIcon icon={ExternalLink} size={14} />
        {url.replace(/(^\w+:|^)\/\//, '').split('/')[0]}
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex flex-col w-full rounded-xl overflow-hidden border transition-all hover:shadow-lg mt-1 mb-2 group/link",
        isSent 
          ? "bg-black/10 border-white/20" 
          : "bg-muted/50 border-border/50"
      )}
    >
      {image && (
        <div className="relative w-full aspect-[1.9/1] overflow-hidden bg-muted">
          <img 
            src={image} 
            alt={title || "Link preview"} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover/link:scale-105 shadow-inner"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}
      <div className="p-3 flex flex-col gap-1 text-left min-w-0">
        <div className="flex items-center gap-1.5 opacity-60 text-[10px] font-bold uppercase tracking-wider mb-0.5">
          <span className="truncate flex-1">{url.replace(/(^\w+:|^)\/\//, '').split('/')[0]}</span>
          <HugeiconsIcon icon={ExternalLink} size={10} className="shrink-0" />
        </div>
        {title && (
          <h4 className={cn(
            "text-sm font-bold leading-tight line-clamp-2",
            isSent ? "text-primary-foreground" : "text-foreground"
          )}>
            {title}
          </h4>
        )}
        {description && (
          <p className={cn(
            "text-xs leading-relaxed line-clamp-2 opacity-80",
            isSent ? "text-primary-foreground/90" : "text-muted-foreground"
          )}>
            {description}
          </p>
        )}
      </div>
    </a>
  )
}
