"use client"

// The device's time, for the Clock card: one shared timer per granularity
// (seconds, minutes), started by the first clock that needs it and stopped
// with the last. Each tick is aimed at the next wall-clock second or minute
// (nextTickDelay), so it never drifts; it pauses while the page is hidden and
// catches up at once when it shows again. Only the clocks subscribed to it
// re-render. The server (and hydration) see null: no time is rendered until
// the device's own is known, so the server's clock never shows.

import { useSyncExternalStore } from "react"
import { nextTickDelay, tickOf } from "@/lib/dashboard/clock"

type Ticker = { subscribe: (onChange: () => void) => () => void; snapshot: () => number }

function createTicker(withSeconds: boolean): Ticker {
  const listeners = new Set<() => void>()
  let now = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const tick = () => {
    const next = tickOf(Date.now(), withSeconds)
    if (next !== now) {
      now = next
      for (const l of listeners) l()
    }
    stop()
    if (!document.hidden) timer = setTimeout(tick, nextTickDelay(new Date(), withSeconds))
  }
  const onVisibility = () => (document.hidden ? stop() : tick())

  return {
    subscribe(onChange) {
      listeners.add(onChange)
      if (listeners.size === 1) {
        document.addEventListener("visibilitychange", onVisibility)
        tick()
      }
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) {
          stop()
          document.removeEventListener("visibilitychange", onVisibility)
        }
      }
    },
    // While running, the last tick (stable between ticks); otherwise the current time.
    snapshot: () => (listeners.size > 0 ? now : tickOf(Date.now(), withSeconds)),
  }
}

let seconds: Ticker | null = null
let minutes: Ticker | null = null
const ticker = (withSeconds: boolean): Ticker =>
  withSeconds ? (seconds ??= createTicker(true)) : (minutes ??= createTicker(false))

const serverSnapshot = () => null

/** The device time (ms), updated every second or every minute; null on the server and while hydrating. */
export function useClockTime(withSeconds: boolean): number | null {
  const t = ticker(withSeconds)
  return useSyncExternalStore<number | null>(t.subscribe, t.snapshot, serverSnapshot)
}
