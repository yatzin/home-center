"use client"

import { Suspense } from "react"
import { unstable_catchError as catchError } from "next/error"
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
 */
export function CardFrame({
  title,
  failed,
  editing,
  className,
  children,
}: {
  title: string
  failed?: boolean
  editing?: boolean
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
  return (
    <Card role="group" aria-label={title} className={cn("relative h-full min-h-0 gap-0 border-t-2 border-t-primary py-0", className)}>
      {editing ? (
        <div inert className="h-full min-h-0 select-none">
          {body}
        </div>
      ) : (
        body
      )}
    </Card>
  )
}
