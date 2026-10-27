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

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { loadDashboardCards, resetDashboardLayout } from "@/lib/actions/dashboard-layout"
import {
  cardsNeedingData,
  configsOf,
  entriesOf,
  markLoadFailed,
  mergeLoaded,
  withData,
  type CanvasCardData,
  type LoadedEntry,
} from "@/lib/dashboard/card-data"
import { cardType } from "@/lib/dashboard/card-types"
import type { ConfigFormContext, ConfigItemOptions } from "@/lib/dashboard/config-form"
import { editReducer, initialEditState, newCardId, snapshotCard } from "@/lib/dashboard/edit-state"
import type { DashboardLayout } from "@/lib/dashboard/layout"
import type { CardResult } from "@/lib/dashboard/loaders"
import type { Features } from "@/lib/features"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { AddCardDialog } from "./add-card-dialog"
import { CardConfigDialog } from "./card-config-dialog"
import { EditBar, type SaveStatus } from "./edit-bar"
import { EditCanvas } from "./edit-canvas"
import { useDashboardEditMode } from "./edit-context"
import { ViewerIsAdminProvider } from "@/components/dashboard/cards/card-configure"
import { reveal } from "./reveal"
import { useAutosave } from "./use-autosave"
import { cardLabel, isShownType, ViewGrid } from "./view-grid"

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
  return (
    <ViewerIsAdminProvider value={isAdmin}>
      {isAdmin ? (
        <DashboardEditor cards={cards} layout={layout} revision={revision} features={features} itemOptions={itemOptions} />
      ) : (
        <ViewGrid cards={cards} layout={layout} features={features} />
      )}
    </ViewerIsAdminProvider>
  )
}

/** The shown cards of a layout, in its order, with the data the page has for each. */
function cardsOf(layout: DashboardLayout, features: Features, data: ReadonlyMap<string, LoadedEntry>): CanvasCardData[] {
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

/**
 * Edit mode's own toaster (Undo after removing a card): bottom centre, just
 * above the sticky edit bar, where a thumb is. The app's top-right toaster is
 * unchanged; toasts sent here carry this id.
 */
const EDIT_TOASTER = "dashboard-edit"
/** Until the bar is measured: about a phone bar's height above the bottom, clear of the safe area. */
const TOAST_FALLBACK_BOTTOM = "calc(4.5rem + env(safe-area-inset-bottom))"

function DashboardEditor({ cards, layout, revision, features, itemOptions }: Omit<CanvasProps, "isAdmin">) {
  const router = useRouter()
  const { editing, setEditing } = useDashboardEditMode()
  const [state, dispatch] = useReducer(editReducer, null, () => initialEditState(layout, revision, features))
  const { saving, error, flush } = useAutosave(state, dispatch)

  // Every card's data seen so far, with the revision it came from, so a
  // removed card comes back instantly on Undo and a refresh that drops a card
  // does not blank it mid-edit. Fresh props are merged in too, but never over
  // newer data or data for a card's current config (a late refresh carries
  // older props).
  const [loaded, setLoaded] = useState(() => entriesOf(cards, revision))
  const [seenCards, setSeenCards] = useState(cards)
  if (seenCards !== cards) {
    setSeenCards(cards)
    const current = configsOf(state.layout.cards)
    setLoaded((prev) => mergeLoaded(prev, cards, revision, current))
  }
  // For async callbacks: a load that resolves later merges against the newest state.
  const stateRef = useRef(state)
  const loadedRef = useRef(loaded)
  useLayoutEffect(() => {
    stateRef.current = state
    loadedRef.current = loaded
  }, [state, loaded])

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

  // Loads data for some cards (from the saved layout) and merges it in. Not
  // router.refresh(): a refresh fired right after a save was seen to stall now
  // and then (its page never committed). On failure, or when the server left a
  // requested card out, those cards show their error state and the editor
  // shows Retry; they are also asked for again after the next save.
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const loadData = useCallback(async (ids: readonly string[]): Promise<boolean> => {
    if (ids.length === 0) {
      // Nothing left to load (the cards were removed, or all have data): no stale banner.
      setLoadError(false)
      return true
    }
    const fail = (missing: ReadonlySet<string>) => {
      const s = stateRef.current
      // Only cards still on the dashboard count; one removed meanwhile is no error.
      const failed = s.layout.cards.filter((c) => missing.has(c.id))
      if (failed.length > 0) setLoaded((prev) => markLoadFailed(prev, failed, s.revision))
      setLoadError(failed.length > 0)
      return failed.length === 0
    }
    try {
      const { revision: read, cards: fresh } = await loadDashboardCards([...ids])
      setLoaded((prev) => mergeLoaded(prev, fresh, read, configsOf(stateRef.current.layout.cards)))
      const returned = new Set(fresh.map((c) => c.id))
      const left = new Set(ids.filter((id) => !returned.has(id)))
      if (left.size > 0) {
        console.error("[dashboard] no data came back for", [...left])
        return fail(left)
      }
      setLoadError(false)
      return true
    } catch (e) {
      console.error("[dashboard] couldn't load card data", e)
      return fail(new Set(ids))
    }
  }, [])

  // A save landed while some cards have no current data: load theirs, once per saved revision.
  const neededKey = cardsNeedingData(editCards).join("\n")
  const loadedFor = useRef(state.revision)
  useEffect(() => {
    if (!neededKey || state.dirty || state.conflict || state.revision <= loadedFor.current) return
    loadedFor.current = state.revision
    void loadData(neededKey.split("\n"))
  }, [neededKey, state.dirty, state.conflict, state.revision, loadData])

  const retryLoad = async () => {
    setRetrying(true)
    await loadData(cardsNeedingData(cardsOf(stateRef.current.layout, features, loadedRef.current)))
    setRetrying(false)
  }

  const [finishing, setFinishing] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Edit-mode toasts sit just above the edit bar. The bar's height above the
  // window's bottom depends on the shell (footer, the page's bottom padding,
  // the safe area), so it is measured, on scroll and resize too (at the end of
  // the page the bar rides higher, in the page flow).
  const [toastBottom, setToastBottom] = useState<string | number>(TOAST_FALLBACK_BOTTOM)
  useEffect(() => {
    if (!editing) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bar = rootRef.current?.querySelector<HTMLElement>("[data-edit-bar]")
        if (!bar) return
        const bottom = Math.max(16, Math.round(window.innerHeight - bar.getBoundingClientRect().top + 8))
        setToastBottom((prev) => (prev === bottom ? prev : bottom))
      })
    }
    measure()
    // The bar's height changes without a window resize too (its message
    // lines, the conflict banner): watch the bar itself.
    const bar = rootRef.current?.querySelector<HTMLElement>("[data-edit-bar]")
    const observer = typeof ResizeObserver === "undefined" || !bar ? null : new ResizeObserver(measure)
    if (bar) observer?.observe(bar)
    window.addEventListener("resize", measure)
    document.addEventListener("scroll", measure, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener("resize", measure)
      document.removeEventListener("scroll", measure, { capture: true })
    }
  }, [editing])

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
    const title = cardLabel(snapshot.card, editCards)
    // Focus goes to the next card in tab order (the previous one if this was
    // the last; Done if none is left), never to the top of the page.
    const els = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])]
    const i = els.findIndex((el) => el.dataset.cardId === id)
    const neighbour = (els[i + 1] ?? els[i - 1])?.dataset.cardId
    dispatch({ type: "remove", id })
    if (neighbour) focusCardOrDone(neighbour)
    else requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-edit-done]")?.focus())
    const toastId: string | number = toast(`${title} removed`, {
      toasterId: EDIT_TOASTER,
      duration: 8000,
      // A 44px Undo on touch screens (sonner's own is 24px).
      classNames: { actionButton: "pointer-coarse:h-11! pointer-coarse:px-4! pointer-coarse:text-sm!" },
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
    announce(`${cardLabel(configuring, editCards)} settings saved. The card is updating.`)
    void flush()
  }

  const configFinalFocus = () => (configuringId ? (cardFocusTarget(rootRef.current, configuringId, ["gear", "grip"])?.focus ?? null) : null)

  const done = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Save, then load data for every card's current config, so the dashboard
      // never shows "Setting up…" outside edit mode. A change that slipped in
      // while waiting (or a card that still has no data) goes round again; if it
      // still is not settled, stay in edit mode rather than leave it unsaved.
      for (let round = 0; round < 3; round++) {
        // Not saved (error or conflict): stay; the bar or banner says why.
        if (!(await flush())) return
        // Failed to load: stay; the banner offers Retry.
        if (!(await loadData(cardsNeedingData(cardsOf(stateRef.current.layout, features, loadedRef.current))))) return
        // Let React commit what the save and the load dispatched before checking.
        await new Promise((resolve) => setTimeout(resolve, 0))
        const s = stateRef.current
        const settled = !s.dirty && !s.conflict && cardsNeedingData(cardsOf(s.layout, features, loadedRef.current)).length === 0
        if (settled) {
          dismissUndoToasts()
          setEditing(false)
          // A background top-up only: the merge ignores anything older than what we have.
          startRefresh(() => router.refresh())
          return
        }
      }
      // Not settled after three rounds: stay, and say why. Changes that kept
      // arriving are still saving; otherwise some card's data is still on its way.
      const s = stateRef.current
      const message = s.dirty ? "Still saving" : "Some cards are still updating"
      announce(`${message}. Tap Done again.`)
      toast(`${message} — tap Done again`, { toasterId: EDIT_TOASTER, duration: 5000 })
    } finally {
      setFinishing(false)
    }
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
      {loadError && !state.conflict && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">
            Some cards couldn&apos;t load. Your changes are saved; try loading them again.
          </p>
          <Button size="sm" variant="outline" onClick={retryLoad} disabled={retrying} className="pointer-coarse:h-11">
            <RefreshCw className={retrying ? "motion-safe:animate-spin" : undefined} aria-hidden />
            Retry
          </Button>
        </div>
      )}
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
        frozen={finishing}
        announce={announce}
        onRemove={remove}
        onConfigure={openConfig}
      />
      <EditBar
        status={status}
        finishing={finishing}
        resetting={resetting}
        phone={state.mode === "phone"}
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
      <Toaster
        id={EDIT_TOASTER}
        position="bottom-center"
        offset={{ bottom: toastBottom }}
        mobileOffset={{ bottom: toastBottom }}
      />
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}
