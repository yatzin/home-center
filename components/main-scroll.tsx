"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ArrowDown } from "lucide-react"
import { inInstalledTouchApp } from "@/lib/file-viewer"
import { cn } from "@/lib/utils"

const THRESHOLD = 72
const MAX_PULL = 110

/**
 * The page area. On desktop it is just a scrolling <main>. In the installed app on a phone
 * (where there is no browser refresh button) pulling down from the top refreshes the page's
 * data, the way people expect from an app. Nothing else about it differs, and the pull only
 * starts from a touch, so a mouse is never affected.
 */
export function MainScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter()
  const ref = useRef<HTMLElement>(null)
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    // Only from the very top, and only in the installed app on a touch device.
    const atTop = (ref.current?.scrollTop ?? 1) <= 0
    startY.current = atTop && !refreshing && inInstalledTouchApp(window) ? e.touches[0].clientY : null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      setPull(0)
      return
    }
    setDragging(true)
    setPull(Math.min(MAX_PULL, dy * 0.5))
  }

  function onTouchEnd() {
    if (startY.current === null) return
    startY.current = null
    setDragging(false)
    if (pull >= THRESHOLD * 0.5) {
      setRefreshing(true)
      setPull(THRESHOLD * 0.5)
      router.refresh()
      // refresh() has no completion signal; a short fixed spin reads as "done" without a stuck spinner.
      window.setTimeout(() => {
        setRefreshing(false)
        setPull(0)
      }, 900)
    } else {
      setPull(0)
    }
  }

  const ready = pull >= THRESHOLD * 0.5
  return (
    <main
      ref={ref}
      className={cn(className, "[@media(display-mode:standalone)_and_(pointer:coarse)]:overscroll-y-contain")}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Zero-height anchor: the indicator hangs from it without moving the page. Phones only. */}
      <div className="sticky top-0 z-20 h-0 md:hidden" aria-hidden={pull === 0 && !refreshing}>
        <div
          className="pointer-events-none absolute left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md"
          style={{ top: pull - 44, opacity: pull > 4 || refreshing ? 1 : 0, transition: dragging ? "none" : "top 150ms, opacity 150ms" }}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className={cn("h-4 w-4 transition-transform", ready && "rotate-180")} />}
        </div>
      </div>
      {children}
      {/* Phones: room after the last card so the floating "+" never hides the end of a page. */}
      <div className="h-20 md:hidden" aria-hidden="true" />
    </main>
  )
}
