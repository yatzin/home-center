import type { InboxReadiness } from "@/lib/inbox-form"

// Same four states as the /intake cards, shrunk to fit a dashboard row.
export const CHIP: Record<InboxReadiness, { label: string; className: string }> = {
  reading: { label: "Reading…", className: "bg-secondary text-secondary-foreground" },
  failed: { label: "Couldn't read", className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  ready: { label: "Ready", className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  check: { label: "Needs a look", className: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
}
