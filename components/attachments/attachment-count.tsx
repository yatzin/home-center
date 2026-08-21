"use client"

import { Paperclip } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Attachment } from "@/app/generated/prisma/client"

export function AttachmentCount({ attachments, onClick }: { attachments: Attachment[]; onClick?: () => void }) {
  if (attachments.length === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onClick}
        className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span className="text-xs">{attachments.length}</span>
      </TooltipTrigger>
      <TooltipContent align="end">
        <ul className="space-y-0.5">
          {attachments.map((a) => (
            <li key={a.id} className="truncate">{a.originalName}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
