"use client"

import { useEffect, useRef, useState } from "react"
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { Loader2 } from "lucide-react"

// The "legacy" build carries the polyfills older iPhones need (Promise.withResolvers and friends).
// It is imported on demand, so none of this loads outside the file viewer. The data files
// (character maps, fonts, decoders) are in public/pdfjs (scripts/copy-pdfjs-assets.mjs).
const ASSETS = "/pdfjs"
const MAX_PAGE_WIDTH = 1000
const MAX_PIXEL_RATIO = 3

/** The PDF, one canvas per page, drawn as each scrolls into view. */
export function PdfPages({ src, page }: { src: string; page: number | null }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const [width, setWidth] = useState(0)
  const [current, setCurrent] = useState(1)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString()
        task = pdfjs.getDocument({
          url: src,
          cMapUrl: `${ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${ASSETS}/standard_fonts/`,
          wasmUrl: `${ASSETS}/wasm/`,
          iccUrl: `${ASSETS}/iccs/`,
        })
        const loaded = await task.promise
        if (!cancelled) setDoc(loaded)
      } catch (e) {
        console.error("[viewer] could not open the PDF:", e instanceof Error ? e.name : typeof e)
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [src])

  // Pages fill the screen's width (up to a comfortable reading width on a big one).
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setWidth(Math.min(el.clientWidth - 16, MAX_PAGE_WIDTH))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [doc])

  if (error) return <p className="px-6 py-16 text-center text-sm text-muted-foreground">This PDF couldn&apos;t be opened. Try Download.</p>
  if (!doc) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground" role="status" aria-label="Loading">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative mx-auto flex w-full flex-col items-center gap-2 py-2">
      {width > 0 &&
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i} doc={doc} number={i + 1} width={width} scrollTo={page === i + 1} onVisible={setCurrent} />
        ))}
      {doc.numPages > 1 && (
        <div className="pointer-events-none sticky bottom-3 mt-[-2.25rem] self-center rounded-full bg-foreground/80 px-3 py-1 text-xs text-background" aria-live="polite">
          Page {current} of {doc.numPages}
        </div>
      )}
    </div>
  )
}

function PdfPage({ doc, number, width, scrollTo, onVisible }: { doc: PDFDocumentProxy; number: number; width: number; scrollTo: boolean; onVisible: (n: number) => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // Until a page is drawn its height is a guess (US Letter), so the scroll bar is about right.
  const [height, setHeight] = useState(Math.round(width * 1.294))
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    // Draw a screen or two ahead; report the page that holds the middle of the screen.
    const draw = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "100% 0px" })
    const seen = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(number), { rootMargin: "-50% 0px -50% 0px" })
    draw.observe(el)
    seen.observe(el)
    return () => {
      draw.disconnect()
      seen.disconnect()
    }
  }, [number, onVisible])

  useEffect(() => {
    if (!near || !canvas.current) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    ;(async () => {
      try {
        const pdfPage = await doc.getPage(number)
        const base = pdfPage.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = pdfPage.getViewport({ scale })
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
        const el = canvas.current
        if (cancelled || !el) return
        el.width = Math.floor(viewport.width * ratio)
        el.height = Math.floor(viewport.height * ratio)
        setHeight(Math.round(viewport.height))
        const render = pdfPage.render({ canvas: el, viewport: pdfPage.getViewport({ scale: scale * ratio }) })
        task = render
        await render.promise
        if (!cancelled && scrollTo) holder.current?.scrollIntoView({ block: "start" })
      } catch (e) {
        // A cancelled draw (the width changed, the page was left) is expected.
        if (!(e instanceof Error && e.name === "RenderingCancelledException")) console.error("[viewer] page", number, "failed")
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [near, doc, number, width, scrollTo])

  return (
    <div ref={holder} className="bg-white shadow-sm" style={{ width, height }}>
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${number}`} role="img" />
    </div>
  )
}
