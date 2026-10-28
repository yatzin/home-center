"use client"

import { Suspense } from "react"
import { catchError } from "next/error"
import { CloudOff } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** The calm stand-in for a card whose data or view failed. */
function CardError({ title }: { title: string }) {
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <CloudOff className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
      <p className="text-sm text-muted-foreground">This card couldn&apos;t load</p>
      <p className="sr-only">{title}</p>
    </div>
  )
}

// A render error in one view is contained to its own card.
const CardErrorBoundary = catchError((props: { title: string }) => <CardError title={props.title} />)

/**
 * Card chrome shared by every dashboard card: shadcn Card filling its grid
 * cell, an error boundary around the view, and the error state for a card
 * whose loader failed (`failed`). With `editing`, the content is inert (links
 * and buttons inside it cannot be clicked or focused): in edit mode the card
 * is something to arrange, and its edit controls sit on top.
 *
 * `bare` (a Text card with its border off): no card at all, the content sits
 * on the page background. In edit mode it gets a faint dashed outline and
 * tint, so it can still be found, grabbed and resized.
 */
export function CardFrame({
  title,
  failed,
  editing,
  interactive,
  busy,
  bare,
  className,
  children,
}: {
  title: string
  failed?: boolean
  editing?: boolean
  /**
   * With `editing`: leave the content usable (a card whose item is gone, for
   * its "Choose another" button). Only `inert` changes, not the tree, so the
   * view is not remounted when this flips.
   */
  interactive?: boolean
  /** Its data is on the way (aria-busy). */
  busy?: boolean
  /** No card chrome (see above). */
  bare?: boolean
  className?: string
  children: React.ReactNode
}) {
  const body = failed ? (
    <CardError title={title} />
  ) : (
    // A view that throws while server rendering makes React fall back to
    // the nearest Suspense boundary and retry on the client, where the
    // error boundary catches it. This boundary keeps that to this card
    // instead of the whole route.
    <Suspense>
      <CardErrorBoundary title={title}>{children}</CardErrorBoundary>
    </Suspense>
  )
  const content = editing ? (
    <div inert={!interactive} className="h-full min-h-0 select-none">
      {body}
    </div>
  ) : (
    body
  )
  if (bare) {
    // Not a labelled group: the text speaks for itself (a greeting is just the page's heading).
    return (
      <div
        aria-busy={busy || undefined}
        className={cn(
          "relative h-full min-h-0 rounded-xl text-sm text-foreground",
          editing && "outline-1 -outline-offset-1 outline-primary/40 outline-dashed bg-primary/5",
          className,
        )}
      >
        {content}
      </div>
    )
  }
  return (
    <Card role="group" aria-label={title} aria-busy={busy || undefined} className={cn("relative h-full min-h-0 gap-0 border-t-2 border-t-primary py-0", className)}>
      {content}
    </Card>
  )
}
