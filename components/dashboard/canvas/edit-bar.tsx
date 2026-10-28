"use client"

// The floating bar shown while editing the dashboard: save status, Reset to
// default (with a confirmation), Add card, and Done. It sticks to the bottom of
// the scrolling page so Done is always in reach. On a phone it spans the width,
// with 44px buttons under the thumb, clear of the bottom safe area. It sits in
// the page flow after the cards, so scrolled to the end it never covers the
// last one.

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

/** A long label, or a short one in the phone bar. */
function Label({ phone, long, short }: { phone: boolean; long: string; short: string }) {
  return <span className="truncate">{phone ? short : long}</span>
}

function Status({ status, phone }: { status: SaveStatus; phone: boolean }) {
  const base = "flex min-w-0 items-center gap-1.5 text-xs"
  switch (status.kind) {
    case "pending":
      return (
        <span className={cn(base, "text-background/70")}>
          <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
          Saving…
        </span>
      )
    case "saved":
      return (
        <span className={cn(base, "text-background/70")}>
          <Check className="size-3.5 shrink-0" aria-hidden />
          <Label phone={phone} long="All changes saved" short="Saved" />
        </span>
      )
    case "error":
      return (
        <span className={cn(base, "font-medium text-background")}>
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{status.message}</span>
        </span>
      )
    case "conflict":
      // The conflict banner is the one signal; the bar stays quiet.
      return null
    default:
      return (
        <span className={cn(base, "text-background/70")}>
          <Label phone={phone} long="Changes save automatically" short="Saves as you go" />
        </span>
      )
  }
}

export function EditBar({
  status,
  finishing,
  resetting,
  phone = false,
  onDone,
  onReset,
  onAddCard,
}: {
  status: SaveStatus
  /** Done was pressed and the last changes are being saved (Add and Reset wait). */
  finishing: boolean
  resetting: boolean
  /** The phone editor: a full-width bar with thumb-sized buttons. */
  phone?: boolean
  onDone: () => void
  /** Resolves when the reset finished (the dialog closes then). */
  onReset: () => Promise<void>
  /** Opens the card picker; without it (after a conflict) the button is shown but disabled. */
  onAddCard?: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      className={cn(
        "pointer-events-none sticky z-40 mt-6 flex justify-center",
        phone ? "bottom-[max(0.5rem,env(safe-area-inset-bottom))]" : "bottom-4",
      )}
    >
      <div
        role="toolbar"
        aria-label="Dashboard editing"
        data-edit-bar
        className={cn(
          "pointer-events-auto flex max-w-full items-center select-none gap-2 rounded-2xl border border-background/20 bg-foreground text-background shadow-xl ring-1 ring-foreground/10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
          phone ? "w-full gap-1 p-1.5 pl-3" : "py-1.5 pr-1.5 pl-3.5",
        )}
      >
        <div role="status" aria-live="polite" className={cn("mr-1 min-w-0 flex-1", !phone && "sm:min-w-40")}>
          <Status status={status} phone={phone} />
        </div>
        <Button
          variant="ghost"
          className={cn("text-background hover:bg-background/15 hover:text-background aria-expanded:bg-background/15 aria-expanded:text-background pointer-coarse:h-11 pointer-coarse:min-w-11", phone && "h-11 min-w-11")}
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={resetting || finishing}
          aria-label="Reset to default"
          title="Reset to default"
        >
          <RotateCcw aria-hidden />
          <span className={phone ? "hidden" : "hidden sm:inline"}>Reset to default</span>
        </Button>
        <Button
          variant="outline"
          className={cn("border-background/50 bg-transparent text-background hover:bg-background/15 hover:text-background pointer-coarse:h-11 pointer-coarse:min-w-11", phone && "h-11 min-w-11")}
          size="sm"
          onClick={onAddCard}
          disabled={!onAddCard || finishing}
          title={onAddCard ? undefined : "Reload first: the dashboard changed elsewhere"}
          aria-label="Add card"
        >
          <Plus aria-hidden />
          <span className={phone ? "" : "hidden sm:inline"}>{phone ? "Add" : "Add card"}</span>
        </Button>
        <Button
          size="sm"
          onClick={onDone}
          disabled={finishing}
          className={cn("min-w-16 bg-background text-foreground hover:bg-background/85 pointer-coarse:h-11", phone && "h-11 min-w-20")}
          data-edit-done
        >
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
