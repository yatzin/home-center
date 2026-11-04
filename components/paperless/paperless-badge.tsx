"use client"

import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useFormat } from "@/components/regional-provider"
import { paperlessBadgeInfo, paperlessLinkHref, type PaperlessBadgeInput } from "@/lib/paperless/badge"
import { usePaperless } from "./paperless-context"

/** Marks an attachment that came from Paperless. The badge and date show even when the feature is off; the link needs it on. */
export function PaperlessBadge({ attachment }: { attachment: PaperlessBadgeInput }) {
  const { linkBase } = usePaperless()
  const fmt = useFormat()
  const info = paperlessBadgeInfo(attachment)
  if (!info.show) return null
  const href = paperlessLinkHref(linkBase, attachment.paperlessId)
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <Badge variant="secondary" className="h-4 px-1.5 text-xs">Paperless</Badge>
      {info.updatedOn && <span>Updated from Paperless on {fmt.date(info.updatedOn)}</span>}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
          Open in Paperless
        </a>
      )}
      {info.broken && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Paperless link broken (not found, or no access)
        </span>
      )}
    </span>
  )
}
