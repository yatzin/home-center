"use client"

// The customizable dashboard on the client. Everyone gets the view; admins
// also get edit mode (entered from the "Edit dashboard" button in the page
// header, see edit-context.tsx).
//
// Edit state lives in one reducer (lib/dashboard/edit-state.ts), created once
// from the first props and never reset by later ones: the page's props change
// after any router refresh, and must not clobber an edit in progress. The
// reducer only takes props over explicitly: on entering edit mode when the
// props are newer, on "Reload" after a conflict, and after Reset to default.
//
// Outside edit mode the page shows the props, unless the reducer holds a newer
// revision (just saved; the refresh after Done has not landed yet), so leaving
// edit mode never flashes the old layout.
//
// Card data comes only from the server. A card added in edit mode, or one whose
// settings changed, has no current data until its save lands and the page
// refreshes: it shows "Setting up…" (or its old data, marked "Updating") until
// then. Adding or configuring saves at once; once a save lands, the editor
// loads data for just those cards (loadDashboardCards) and merges it into its
// data map (lib/dashboard/card-data.ts), without touching its layout. Fresh
// props from a later refresh are merged the same way.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { loadDashboardCards, resetDashboardLayout } from "@/lib/actions/dashboard-layout"
import { cardsNeedingData, mergeLoaded, withData, type CanvasCardData } from "@/lib/dashboard/card-data"
import { cardType } from "@/lib/dashboard/card-types"
import type { ConfigFormContext, ConfigItemOptions } from "@/lib/dashboard/config-form"
import { editReducer, initialEditState, newCardId, snapshotCard } from "@/lib/dashboard/edit-state"
import type { DashboardLayout } from "@/lib/dashboard/layout"
import type { CardResult } from "@/lib/dashboard/loaders"
import type { Features } from "@/lib/features"
import { Button } from "@/components/ui/button"
import { AddCardDialog } from "./add-card-dialog"
import { CardConfigDialog } from "./card-config-dialog"
import { EditBar, type SaveStatus } from "./edit-bar"
import { EditCanvas } from "./edit-canvas"
import { useDashboardEditMode } from "./edit-context"
import { useAutosave } from "./use-autosave"
import { cardTitle, isShownType, ViewGrid } from "./view-grid"

type CanvasProps = {
  cards: CardResult[]
  /** The stored layout (phone may be null: derived). */
  layout: DashboardLayout
  /** Saves are based on it. */
  revision: number
  /** The features the server rendered with (which cards show, how phone is derived). */
  features: Features
  /** Admins get edit mode. */
  isAdmin: boolean
  /** What card settings can pick from (admins only; null otherwise). */
  itemOptions: ConfigItemOptions | null
}

export function DashboardCanvas({ cards, layout, revision, features, isAdmin, itemOptions }: CanvasProps) {
  if (!isAdmin) return <ViewGrid cards={cards} layout={layout} features={features} />
  return <DashboardEditor cards={cards} layout={layout} revision={revision} features={features} itemOptions={itemOptions} />
}

/**
 * Scrolls the nearest scrolling ancestor just enough to show `el`. Not
 * scrollIntoView: that also scrolls the app shell's overflow-hidden boxes.
 */
function reveal(el: HTMLElement) {
  let scroller = el.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const margin = 96
  if (r.top < box.top + margin) scroller.scrollBy({ top: r.top - box.top - margin })
  else if (r.bottom > box.bottom - margin) scroller.scrollBy({ top: r.bottom - box.bottom + margin })
}

/** The shown cards of a layout, in its order, with the data the page has for each. */
function cardsOf(layout: DashboardLayout, features: Features, data: ReadonlyMap<string, CardResult>): CanvasCardData[] {
  return withData(
    layout.cards.filter((c) => isShownType(c.type, features)),
    data,
  )
}

/**
 * A card's element, and what to focus for it: the first of `prefer` it has
 * ("grip" in the large editor, "gear" on configurable cards), else nothing.
 */
function cardFocusTarget(
  root: HTMLElement | null,
  id: string,
  prefer: readonly ("grip" | "gear")[],
): { card: HTMLElement; focus: HTMLElement | null } | null {
  const card = root?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
  if (!card) return null
  for (const p of prefer) {
    const el = card.querySelector<HTMLElement>(`[data-${p}]`)
    if (el) return { card, focus: el }
  }
  return { card, focus: null }
}

function DashboardEditor({ cards, layout, revision, features, itemOptions }: Omit<CanvasProps, "isAdmin">) {
  const router = useRouter()
  const { editing, setEditing } = useDashboardEditMode()
  const [state, dispatch] = useReducer(editReducer, null, () => initialEditState(layout, revision, features))
  const { saving, error, flush } = useAutosave(state, dispatch)

  // Every card's data seen so far, so a removed card comes back instantly on
  // Undo, and a refresh that drops a card does not blank it mid-edit.
  // Fresh props (a refresh) also bring data for added and reconfigured cards.
  const [loaded, setLoaded] = useState(() => new Map(cards.map((c) => [c.id, c])))
  const [seenCards, setSeenCards] = useState(cards)
  if (seenCards !== cards) {
    setSeenCards(cards)
    setLoaded((prev) => mergeLoaded(prev, cards))
  }

  // Entering edit mode starts from the newest layout we know of.
  const [wasEditing, setWasEditing] = useState(editing)
  const [sessionStart, setSessionStart] = useState(state.revision)
  if (wasEditing !== editing) {
    setWasEditing(editing)
    if (editing) {
      if (revision > state.revision && !state.dirty) dispatch({ type: "replace", layout, revision })
      setSessionStart(Math.max(revision, state.revision))
    }
  }

  // Conflict "Reload": refresh the page's props, then take them over.
  const [reloadPending, startReload] = useTransition()
  const [reloadWanted, setReloadWanted] = useState(false)
  if (reloadWanted && !reloadPending) {
    setReloadWanted(false)
    dispatch({ type: "replace", layout, revision })
  }

  const [, startRefresh] = useTransition()
  const editCards = cardsOf(state.layout, features, loaded)

  // A save landed while some cards have no current data: load theirs, once per
  // saved revision, and merge it in. Not router.refresh(): a refresh fired
  // right after a save was seen to stall now and then (its page never
  // committed), leaving the card "Updating" until the next save. A failure
  // leaves it "Updating" until the next save or Done.
  const neededKey = cardsNeedingData(editCards).join("\n")
  const loadedFor = useRef(state.revision)
  useEffect(() => {
    if (!neededKey || state.dirty || state.conflict || state.revision <= loadedFor.current) return
    loadedFor.current = state.revision
    loadDashboardCards(neededKey.split("\n"))
      .then((fresh) => setLoaded((prev) => mergeLoaded(prev, fresh)))
      .catch(() => {})
  }, [neededKey, state.dirty, state.conflict, state.revision])

  const [finishing, setFinishing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [announcement, setAnnouncement] = useState("")
  const announce = useCallback((message: string) => {
    // A trailing toggle makes a repeated message announce again.
    setAnnouncement((prev) => (prev === message ? `${message} ` : message))
  }, [])

  const undoToasts = useRef(new Set<string | number>())
  const dismissUndoToasts = () => {
    for (const id of undoToasts.current) toast.dismiss(id)
    undoToasts.current.clear()
  }
  // Leaving the page mid-edit: an Undo for a card of a gone editor would do nothing useful.
  useEffect(() => {
    const pending = undoToasts.current
    return () => {
      for (const id of pending) toast.dismiss(id)
      pending.clear()
    }
  }, [])

  // Focus: into the editor when it opens (the first card's grip, or Done);
  // the header button takes it back on leaving (edit-context.tsx).
  const rootRef = useRef<HTMLDivElement>(null)
  const focusCardOrDone = useCallback((id?: string) => {
    requestAnimationFrame(() => {
      const root = rootRef.current
      if (!root) return
      const grip = id
        ? root.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] [data-grip]`)
        : root.querySelector<HTMLElement>("[data-card-id] [data-grip]")
      const target = grip ?? root.querySelector<HTMLElement>("[data-edit-done]")
      if (!target) return
      target.focus({ preventScroll: true })
      // Leaving a toast (Undo) makes sonner hand focus back to where it was
      // before the toast; a second focus, now from outside the toast, sticks.
      if (document.activeElement !== target) target.focus({ preventScroll: true })
      if (id) reveal(target)
    })
  }, [])
  useEffect(() => {
    if (editing) focusCardOrDone()
  }, [editing, focusCardOrDone])

  const remove = (id: string) => {
    const snapshot = snapshotCard(state, id)
    if (!snapshot) return
    const title = cardTitle(snapshot.card.type)
    // Focus goes to the next card in tab order (the previous one if this was
    // the last; Done if none is left), never to the top of the page.
    const els = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])]
    const i = els.findIndex((el) => el.dataset.cardId === id)
    const neighbour = (els[i + 1] ?? els[i - 1])?.dataset.cardId
    dispatch({ type: "remove", id })
    if (neighbour) focusCardOrDone(neighbour)
    else requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-edit-done]")?.focus())
    const toastId: string | number = toast(`${title} removed`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          undoToasts.current.delete(toastId)
          dispatch({ type: "restore", snapshot })
          announce(`${title} is back.`)
          focusCardOrDone(snapshot.card.id)
        },
      },
      onDismiss: () => undoToasts.current.delete(toastId),
      onAutoClose: () => undoToasts.current.delete(toastId),
    })
    undoToasts.current.add(toastId)
    announce(`${title} removed. Undo is in the notification.`)
  }

  // ---- Add card ----

  const [pickerOpen, setPickerOpen] = useState(false)
  const pickedRef = useRef<string | null>(null)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of state.layout.cards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return counts
  }, [state.layout.cards])

  const addCard = (typeId: string) => {
    const def = cardType(typeId)
    if (!def) return
    const id = newCardId(
      typeId,
      state.layout.cards.map((c) => c.id),
    )
    dispatch({ type: "add", cardType: typeId, id })
    pickedRef.current = id
    setPickerOpen(false)
    announce(`${def.label} added at the bottom of the dashboard.`)
    // Save now rather than after the debounce, so its data arrives sooner.
    void flush()
  }

  /** On closing the picker: the new card (scrolled into view), or the Add card button (null). */
  const pickerFinalFocus = () => {
    const id = pickedRef.current
    pickedRef.current = null
    const target = id ? cardFocusTarget(rootRef.current, id, ["grip", "gear"]) : null
    if (!target) return null
    reveal(target.card)
    return target.focus
  }

  // ---- Card settings ----

  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const configuring = state.layout.cards.find((c) => c.id === configuringId) ?? null
  const configCtx: ConfigFormContext = useMemo(() => ({ items: itemOptions, features }), [itemOptions, features])

  const openConfig = useCallback((id: string) => {
    setConfiguringId(id)
    setConfigOpen(true)
  }, [])

  const saveConfig = (config: Record<string, unknown>) => {
    if (!configuring) return
    dispatch({ type: "config", id: configuring.id, config })
    setConfigOpen(false)
    announce(`${cardTitle(configuring.type)} settings saved. The card is updating.`)
    void flush()
  }

  const configFinalFocus = () => (configuringId ? (cardFocusTarget(rootRef.current, configuringId, ["gear", "grip"])?.focus ?? null) : null)

  const done = async () => {
    if (finishing) return
    setFinishing(true)
    const ok = await flush()
    setFinishing(false)
    // Not saved (error or conflict): stay in edit mode; the bar or banner says why.
    if (!ok) return
    dismissUndoToasts()
    setEditing(false)
    startRefresh(() => router.refresh())
  }

  const reload = () => {
    dismissUndoToasts()
    setReloadWanted(true)
    startReload(() => router.refresh())
  }

  const reset = async () => {
    setResetting(true)
    try {
      // Settle a pending autosave first, so it cannot land after the reset.
      await flush({ retryFailed: false })
      const result = await resetDashboardLayout()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      dismissUndoToasts()
      dispatch({ type: "replace", layout: result.layout, revision: result.revision })
      announce("Dashboard reset to default.")
      toast.success("Dashboard reset to default")
    } catch {
      toast.error("Couldn't reset the dashboard. Check your connection and try again.")
    } finally {
      setResetting(false)
    }
  }

  if (!editing) {
    // Just saved and the refresh is still on its way: show what was saved.
    const shown = state.revision > revision ? state.layout : layout
    const showCards = shown === layout ? cards : cardsOf(shown, features, loaded)
    return <ViewGrid cards={showCards} layout={shown} features={features} />
  }

  const status: SaveStatus = state.conflict
    ? { kind: "conflict" }
    : error
      ? { kind: "error", message: error }
      : saving || state.dirty
        ? { kind: "pending" }
        : state.revision > sessionStart
          ? { kind: "saved" }
          : { kind: "idle" }

  return (
    <div ref={rootRef}>
      {state.conflict && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">
            Someone else changed the dashboard while you were editing. Reload to see their version; your changes since then
            weren&apos;t saved.
          </p>
          <Button size="sm" variant="outline" onClick={reload} disabled={reloadPending}>
            <RefreshCw className={reloadPending ? "motion-safe:animate-spin" : undefined} aria-hidden />
            Reload
          </Button>
        </div>
      )}
      <EditCanvas
        state={state}
        dispatch={dispatch}
        cards={editCards}
        features={features}
        readOnly={state.conflict}
        announce={announce}
        onRemove={remove}
        onConfigure={openConfig}
      />
      <EditBar
        status={status}
        finishing={finishing}
        resetting={resetting}
        onDone={done}
        onReset={reset}
        onAddCard={state.conflict ? undefined : () => setPickerOpen(true)}
      />
      <AddCardDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        features={features}
        counts={typeCounts}
        onPick={addCard}
        finalFocus={pickerFinalFocus}
      />
      <CardConfigDialog
        card={configuring}
        open={configOpen && configuring !== null && !state.conflict}
        onOpenChange={setConfigOpen}
        ctx={configCtx}
        onSave={saveConfig}
        finalFocus={configFinalFocus}
      />
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}
