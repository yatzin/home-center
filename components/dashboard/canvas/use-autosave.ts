"use client"

// Autosave for dashboard edit mode. Saves the layout ~600 ms after the last
// change, one save at a time: a change made while a save is in flight is saved
// right after it, against the revision that save returned. A conflict stops
// autosaving until the state is replaced (reload); other errors are returned
// for display and retried on the next change. `flush()` saves now (Done, tab
// hidden, page hide). The decisions live in lib/dashboard/edit-state.ts.

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react"
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

export function useAutosave(
  state: EditState,
  dispatch: Dispatch<EditAction>,
): { saving: boolean; error: string | null; flush: () => Promise<void> } {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  const trackerRef = useRef<SaveTracker>(initialTracker(state))
  const inFlightRef = useRef<Promise<void> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flush = useCallback(async () => {
    clearTimer()
    for (;;) {
      if (inFlightRef.current) {
        await inFlightRef.current
        continue
      }
      const save = nextSave(stateRef.current, trackerRef.current)
      if (!save) return
      const run = (async () => {
        setSaving(true)
        let result: Awaited<ReturnType<typeof saveDashboardLayout>>
        try {
          result = await saveDashboardLayout(save)
        } catch {
          result = { error: "Couldn't save the dashboard. Check your connection and try again." }
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
  }, [clearTimer, dispatch])

  // Debounce: (re)start the timer whenever there is something new to save.
  useEffect(() => {
    if (!nextSave(state, trackerRef.current)) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void flush()
    }, AUTOSAVE_DELAY_MS)
    return clearTimer
  }, [state, clearTimer, flush])

  // Save before the tab is hidden or the page goes away.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush()
    }
    const onPageHide = () => void flush()
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
    }
  }, [clearTimer])

  return { saving, error, flush }
}
