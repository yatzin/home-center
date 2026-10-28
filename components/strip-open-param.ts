"use client"

import { useEffect } from "react"
import { withoutOpenParam } from "@/lib/deep-link"

/**
 * Each time (`opens` counts them) a list has opened the dialog an `?open=<id>` link named, drops `open`
 * from the address (the native History API, which Next keeps in sync), so a
 * reload or Back does not open the dialog again. The page is not navigated:
 * nothing re-renders and the dialog stays as it is.
 */
export function useStripOpenParam(opens: number) {
  useEffect(() => {
    if (opens === 0) return
    const search = withoutOpenParam(window.location.search)
    if (search === null) return
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`)
  }, [opens])
}
