"use client"

// The Text card: plain text (with its {tokens} already resolved by the
// server) in one of seven styles. Rendered as React text nodes and, for the
// values about a page or an item, links (whose hrefs come from the server's
// token table, never from the text): no HTML, no markdown. Line breaks are
// kept and long words wrap. The text is centred vertically and clamped to the
// lines that fit, with an ellipsis; when it is cut, its full text is in the
// title attribute. In edit mode the card frame makes the links inert.

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { clampLines, readTextConfig, textSegmentsOf, type TextAlign, type TextStyle } from "@/lib/dashboard/text-card"
import { segmentsText } from "@/lib/dashboard/text-template"
import { cn } from "@/lib/utils"
import { GAP, ROW_HEIGHT } from "@/components/dashboard/canvas/grid-metrics"
import type { CardViewProps } from "./types"

// Sizes as the site's page headings use them (the old dashboard greeting was
// the H1 here); line heights match LINE_HEIGHTS in lib/dashboard/text-card.ts.
const STYLE_CLASSES: Record<TextStyle, string> = {
  h1: "font-heading text-xl leading-7 font-semibold tracking-tight",
  h2: "font-heading text-lg leading-7 font-semibold",
  h3: "font-heading text-base leading-6 font-semibold",
  h4: "font-heading text-sm leading-5 font-semibold",
  body: "text-sm leading-5",
  small: "text-xs leading-4",
  muted: "text-sm leading-5 text-muted-foreground",
}

// A value that links: the text's own size, weight and colour, with a faint
// underline (30% of the text colour) that turns solid on hover and focus; a
// 2px focus ring drawn inside the link (the clamped text box clips anything
// outside it); on touch screens, padding that grows the tap target to about
// 24px without moving the text (an inline element's padding takes no space).
const LINK_CLASSES = cn(
  "rounded-[3px] underline decoration-current/30 decoration-1 underline-offset-[0.2em] transition-[text-decoration-color] duration-150",
  "hover:decoration-current focus-visible:decoration-current focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
  "pointer-coarse:py-1",
)

const ALIGN_CLASSES: Record<TextAlign, string> = { left: "text-left", center: "text-center", right: "text-right" }

const TAGS: Record<TextStyle, "h1" | "h2" | "h3" | "h4" | "p"> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  small: "p",
  muted: "p",
}

// Vertical room the frame and padding take: a card has a 2px top and 1px
// bottom border and py-3; a bare (borderless) one has neither.
const CARD_CHROME = 3 + 24

export function TextCard({ data, config, size, editing }: CardViewProps) {
  const c = readTextConfig(config)
  const bare = !c.border
  const segments = textSegmentsOf(data)
  const text = segmentsText(segments)
  // First paint (server and client alike): the lines a card of this many rows
  // fits; then the measured box decides (the phone layout's height may differ).
  const rowsPx = size.h * ROW_HEIGHT + (size.h - 1) * GAP - (bare ? 0 : CARD_CHROME)
  const [lines, setLines] = useState(() => clampLines(rowsPx, c.style))
  const [cut, setCut] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const el = textRef.current
    if (!box || !el) return
    const measure = () => {
      const styles = getComputedStyle(box)
      const inner = box.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
      const n = clampLines(inner, c.style)
      setLines(n)
      // Cut when the clamped text is taller than the box shows.
      setCut(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [c.style, text, lines])

  const Tag = TAGS[c.style]
  // A narrow card (one column) keeps more of its width for the text.
  return (
    <div className="@container h-full min-h-0">
      <div ref={boxRef} className={cn("flex h-full min-h-0 flex-col overflow-hidden", bare ? "px-0" : "px-2.5 py-3 @[10rem]:px-5")}>
        {text === "" ? (
          // Nothing to say (e.g. "{user}" with no name): in edit mode a hint, so the card is not a blank box.
          editing ? <p className="my-auto text-xs text-muted-foreground italic">Empty text</p> : null
        ) : (
          <Tag
            ref={textRef as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
            title={cut ? text : undefined}
            className={cn("my-auto w-full min-w-0 break-words whitespace-pre-wrap", STYLE_CLASSES[c.style], ALIGN_CLASSES[c.align])}
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }}
          >
            {segments.map((seg, i) =>
              "href" in seg ? (
                <Link key={i} href={seg.href} title={seg.title || undefined} aria-label={seg.label} className={LINK_CLASSES}>
                  {seg.text}
                </Link>
              ) : (
                seg.text
              ),
            )}
          </Tag>
        )}
      </div>
    </div>
  )
}
