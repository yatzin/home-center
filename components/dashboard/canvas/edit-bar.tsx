"use client"

// The floating bar shown while editing the dashboard: save status, Reset to
// default (with a confirmation), Add card, and Done. It sticks to the bottom of
// the scrolling page so Done is always in reach.

import { useState } from "react"
import { Check, CircleAlert, Loader2, Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  /** The conflict banner explains it; the bar stays quiet. */
  | { kind: "conflict" }

function Status({ status }: { status: SaveStatus }) {
  const base = "flex min-w-0 items-center gap-1.5 text-xs"
  switch (status.kind) {
    case "pending":
      return (
        <span className={cn(base, "text-muted-foreground")}>
          <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
          Saving…
        </span>
      )
    case "saved":
      return (
        <span className={cn(base, "text-muted-foreground")}>
          <Check className="size-3.5 shrink-0" aria-hidden />
          All changes saved
        </span>
      )
    case "error":
      return (
        <span className={cn(base, "text-destructive")}>
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{status.message}</span>
        </span>
      )
    case "conflict":
      return <span className={cn(base, "text-muted-foreground")}>Not saved</span>
    default:
      return <span className={cn(base, "text-muted-foreground")}>Changes save automatically</span>
  }
}

export function EditBar({
  status,
  finishing,
  resetting,
  onDone,
  onReset,
  onAddCard,
}: {
  status: SaveStatus
  /** Done was pressed and the last changes are being saved. */
  finishing: boolean
  resetting: boolean
  onDone: () => void
  /** Resolves when the reset finished (the dialog closes then). */
  onReset: () => Promise<void>
  /** Opens the card picker; without it the button is shown but disabled. */
  onAddCard?: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="pointer-events-none sticky bottom-4 z-40 mt-6 flex justify-center">
      <div
        role="toolbar"
        aria-label="Dashboard editing"
        className="pointer-events-auto flex max-w-full items-center select-none gap-2 rounded-2xl border border-border bg-popover/95 py-1.5 pr-1.5 pl-3.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
      >
        <div role="status" aria-live="polite" className="mr-1 min-w-0 flex-1 sm:min-w-40">
          <Status status={status} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={resetting}
          aria-label="Reset to default"
        >
          <RotateCcw aria-hidden />
          <span className="hidden sm:inline">Reset to default</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddCard}
          disabled={!onAddCard}
          title={onAddCard ? undefined : "Adding cards is coming soon"}
          aria-label="Add card"
        >
          <Plus aria-hidden />
          <span className="hidden sm:inline">Add card</span>
        </Button>
        <Button size="sm" onClick={onDone} disabled={finishing} className="min-w-16">
          {finishing ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
          Done
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !resetting && setConfirming(open)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Reset the dashboard?</DialogTitle>
            <DialogDescription>
              This puts back the default cards in their default places, on large screens and on phones, for everyone.
              Card settings are cleared. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={resetting} />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={resetting}
              onClick={async () => {
                await onReset()
                setConfirming(false)
              }}
            >
              {resetting ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
              Reset to default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
