"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

/** Card title row: the uppercase label and an optional "View all" link. */
export function CardShellHeader({ title, href, linkLabel = "View all →" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-4 pb-2">
      <h2 className="truncate text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {href && (
        <Link
          href={href}
          aria-label={`${linkLabel.replace(/\s*→\s*$/, "")} ${title}`}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

/**
 * Layout inside a CardFrame: an optional header, then a body that takes the
 * rest of the cell and clips (or scrolls, with `scroll`) instead of growing.
 */
export function CardShell({
  title,
  href,
  linkLabel,
  scroll,
  className,
  children,
}: {
  title?: string
  href?: string
  linkLabel?: string
  scroll?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {title && <CardShellHeader title={title} href={href} linkLabel={linkLabel} />}
      <div className={cn("min-h-0 flex-1", scroll ? "overflow-y-auto" : "overflow-hidden", className)}>{children}</div>
    </div>
  )
}

/** A centred icon and message for an empty or degraded card. */
export function CardMessage({
  icon: Icon,
  message,
  note,
  action,
  footer,
}: {
  icon: React.ElementType
  message: string
  note?: string
  action?: { href: string; label: string }
  /** Under the message (e.g. ChooseAnother). */
  footer?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 py-3 text-center">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      {note && <p className="text-xs text-muted-foreground/80">{note}</p>}
      {action && (
        <Link
          href={action.href}
          className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
        >
          {action.label}
        </Link>
      )}
      {footer}
    </div>
  )
}

/** A small heading over a group of rows ("Overdue 2", "June 2026 3"). */
export function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="flex items-baseline gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
      <span className="tabular-nums text-muted-foreground/70">{count}</span>
    </h3>
  )
}
