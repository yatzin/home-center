"use client"

import { useLayoutEffect, useRef, useState } from "react"

/// The live content width of an element (0 until measured, e.g. on the server).
/// For charts sized by their container rather than by a fixed pixel height.
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
