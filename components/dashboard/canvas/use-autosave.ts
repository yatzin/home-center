"use client"

// Autosave for dashboard edit mode. Saves the layout ~600 ms after the last
// change, one save at a time: a change made while a save is in flight is saved
// right after it, against the revision that save returned. A conflict stops
// autosaving until the state is replaced (reload); other errors are returned
// for display and retried on the next change. `flush()` saves now (Done, tab
// hidden, page hide, unmount). The decisions live in lib/dashboard/edit-state.ts.
//
// On a conflict both `error` and `state.conflict` are set: the UI should show
// only the conflict banner.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from "react"
import { saveDashboardLayout } from "@/lib/actions/dashboard-layout"
import {
  applySaveResult,
  initialTracker,
  nextSave,
  type EditAction,
  type EditState,
  type SaveTracker,
} from "@/lib/dashboard/edit-state"

export const AUTOSAVE_DELAY_MS = 600

export type FlushOptions = {
  /** Retry a layout whose last save failed. Default true (an explicit flush, e.g. Done). */
  retryFailed?: boolean
}

export function useAutosave(
  state: EditState,
  dispatch: Dispatch<EditAction>,
): {
  saving: boolean
  error: string | null
  /** Saves now; resolves true when nothing unsaved remains, false after a failed save or a conflict. */
  flush: (options?: FlushOptions) => Promise<boolean>
} {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  const trackerRef = useRef<SaveTracker>(initialTracker(state))
  const inFlightRef = useRef<Promise<void> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // A layout effect, so a flush right after a dispatch (same event) sees it.
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flush = useCallback(
    async ({ retryFailed = true }: FlushOptions = {}): Promise<boolean> => {
      clearTimer()
      // Yield once so a dispatch made in the same event commits (and syncs stateRef) first.
      await Promise.resolve()
      let retry = retryFailed
      for (;;) {
        if (inFlightRef.current) {
          await inFlightRef.current
          continue
        }
        const current = stateRef.current
        const save = nextSave(current, trackerRef.current, retry)
        if (!save) {
          const t = trackerRef.current
          // stateRef may lag the dispatches below, so the tracker decides too.
          return (
            !current.conflict &&
            current.layout !== t.failedLayout &&
            (!current.dirty || current.layout === t.savedLayout)
          )
        }
        // A failed layout is retried at most once per flush.
        retry = false
        const run = (async () => {
          if (mountedRef.current) setSaving(true)
          let result: Awaited<ReturnType<typeof saveDashboardLayout>>
          try {
            result = await saveDashboardLayout(save)
          } catch {
            result = {
              error: "Couldn't save the dashboard. Check your connection and try again.",
            }
          }
          const r = applySaveResult(trackerRef.current, save.layout, result)
          trackerRef.current = r.tracker
          if (mountedRef.current) {
            setError(r.error)
            setSaving(false)
          }
          if (r.action) dispatch(r.action)
        })()
        inFlightRef.current = run
        try {
          await run
        } finally {
          inFlightRef.current = null
        }
        // A failed or conflicting save leaves nothing new to save, so the loop ends.
        // After a success, it saves again only if the layout changed meanwhile.
      }
    },
    [clearTimer, dispatch],
  )

  // Debounce: (re)start the timer whenever there is something new to save.
  useEffect(() => {
    if (!nextSave(state, trackerRef.current)) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void flush({ retryFailed: false })
    }, AUTOSAVE_DELAY_MS)
    return clearTimer
  }, [state, clearTimer, flush])

  // Save before the tab is hidden or the page goes away. visibilitychange to
  // "hidden" is the reliable hook; pagehide is best-effort (the request may be
  // cut off as the page unloads).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush({ retryFailed: false })
    }
    const onPageHide = () => void flush({ retryFailed: false })
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [flush])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimer()
      // Leaving edit mode with a pending change: save it (not awaited). State
      // updates are skipped once unmounted; a dispatch then is harmless.
      if (nextSave(stateRef.current, trackerRef.current)) void flush({ retryFailed: false })
    }
  }, [clearTimer, flush])

  return { saving, error, flush }
}
