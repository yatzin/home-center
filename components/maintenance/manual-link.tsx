import { BookOpen } from "lucide-react"
import { FileLink } from "@/components/attachments/file-link"

export type ManualLinkTarget = { href: string; label: string; title: string } | null | undefined

/** "Manual, p. 42": opens the reminder's linked file (at that page for a PDF) in a new tab. */
export function ManualLink({ manual, className = "" }: { manual: ManualLinkTarget; className?: string }) {
  if (!manual) return null
  return (
    <FileLink
      href={manual.href}
      name={manual.title}
      title={manual.title}
      // The row opens the edit form on click; this link must not.
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline ${className}`}
    >
      <BookOpen className="h-3 w-3" />
      {manual.label}
    </FileLink>
  )
}
