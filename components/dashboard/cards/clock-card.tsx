"use client"

// The Clock card: the viewer's device time and today's date, in the
// household's formats (Settings > Regional: 12 or 24 hour, date format). The look follows the size
// (clockLook) and is fitted to the measured box (fitClock): the time alone,
// the time over the date, or an analog face with the time. Nothing shows
// until the device's time is known (the server's would be wrong), and the
// card's box is fixed by the grid, so its content appearing shifts nothing.

import { useMemo } from "react"
import { useFormat } from "@/components/regional-provider"
import { useSize } from "@/components/charts/primitives/use-width"
import { handAngles, readClockConfig, weekdayName, weekdayShort } from "@/lib/dashboard/clock"
import { clockLook, fitClock, layoutBoxes, SUFFIX_SCALE, type Box } from "@/lib/dashboard/clock-layout"
import { cn } from "@/lib/utils"
import type { CardViewProps } from "./types"
import { useClockTime } from "./use-clock-time"

const at = (b: Box): React.CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h })

export function ClockCard({ config, size, mode }: CardViewProps) {
  const c = readClockConfig(config)
  const fmt = useFormat()
  // No Edit button in the card any more (the page has its own corner tab), so no room is held for one.
  const edit = false
  const look = clockLook(size, mode, c.face)
  const [ref, box] = useSize<HTMLDivElement>()
  const now = useClockTime(c.showSeconds)

  const d = now === null ? null : new Date(now)
  // The date forms, longest first; they change once a day.
  const dayKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : ""
  const dates = useMemo(() => {
    if (!dayKey) return []
    const [y, m, day] = dayKey.split("-").map(Number)
    const date = new Date(y, m, day, 12)
    const full = fmt.date(date)
    return [`${weekdayName(date)}, ${full}`, `${weekdayShort(date)}, ${full}`, full, fmt.dayMonth(date)]
  }, [dayKey, fmt])

  const fit = useMemo(
    () =>
      fitClock({
        look,
        width: box.width,
        height: box.height,
        showDate: c.showDate,
        seconds: c.showSeconds,
        period: fmt.hour12,
        edit,
        dates,
      }),
    [look, box.width, box.height, c.showDate, c.showSeconds, fmt.hour12, edit, dates],
  )
  const boxes = layoutBoxes(fit, { width: box.width, height: box.height, edit })
  const ready = d !== null && fit.timePx > 0
  const parts = d ? fmt.timeParts(d) : null
  const minuteLabel = d ? fmt.time(d) : ""

  return (
    <div className="@container h-full min-h-0">
      <div className="h-full min-h-0 p-1 @[4rem]:p-2 @[10rem]:px-3.5 @[10rem]:py-3">
        <div ref={ref} className="relative h-full min-h-0 w-full overflow-hidden">
          {ready && parts && (
            // Keyed by look: it fades in when it first shows and when a resize changes the look.
            <div key={`${fit.look}-${fit.direction}`} className="chart-fade">
                {boxes.face && (
                  <div className="absolute" style={at(boxes.face)}>
                    <AnalogFace date={d} size={boxes.face.w} seconds={c.showSeconds} label={`Clock, ${minuteLabel}`} />
                  </div>
                )}
                <time
                  dateTime={d.toISOString()}
                  className={cn(
                    "absolute flex font-heading leading-none font-semibold tracking-tight whitespace-nowrap text-foreground tabular-nums",
                    fit.suffix === "stacked" ? "flex-col items-center" : "items-baseline",
                    fit.look === "standard" || (fit.look === "face" && fit.direction === "row") ? "justify-start" : "justify-center",
                  )}
                  style={{ ...at(boxes.time), fontSize: fit.timePx }}
                >
                  <span>{parts.hm}</span>
                  <Suffix fit={fit.suffix} seconds={c.showSeconds ? parts.seconds : null} period={parts.period} />
                </time>
                {boxes.date && (
                  <p
                    className={cn(
                      "absolute truncate leading-[1.4] font-medium whitespace-nowrap text-muted-foreground",
                      fit.look === "standard" || (fit.look === "face" && fit.direction === "row") ? "text-left" : "text-center",
                    )}
                    style={{ ...at(boxes.date), fontSize: fit.datePx }}
                  >
                    {fit.date}
                  </p>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The seconds and AM/PM, small and muted: after the time on its baseline (both: stacked, AM/PM on the baseline), or under it. */
function Suffix({ fit, seconds, period }: { fit: "inline" | "stacked" | "none"; seconds: string | null; period: string | null }) {
  if (fit === "none" || (!seconds && !period)) return null
  const small = "font-sans font-medium text-muted-foreground tracking-normal"
  if (fit === "stacked") {
    return (
      <span className={cn("mt-[0.06em] flex gap-[0.3em] leading-[1.2]", small)} style={{ fontSize: `${SUFFIX_SCALE}em` }}>
        {seconds && <span>{seconds}</span>}
        {period && <span>{period}</span>}
      </span>
    )
  }
  if (seconds && period) {
    return (
      <span
        className={cn("ml-[0.35em] inline-flex flex-col self-end leading-[1.1]", small)}
        // Bottom-aligned with the digits' baseline (their line box reaches ~0.2em below it).
        style={{ fontSize: `${SUFFIX_SCALE}em`, marginBottom: "0.3em" }}
      >
        <span>{seconds}</span>
        <span>{period}</span>
      </span>
    )
  }
  return (
    <span className={cn("ml-[0.35em]", small)} style={{ fontSize: `${SUFFIX_SCALE}em` }}>
      {seconds ?? period}
    </span>
  )
}

/**
 * A minimal analog face: a hairline dial, twelve ticks (the quarters longer
 * and heavier, fine minute marks once there is room), hour and minute hands in
 * the foreground colour, and the second hand (only with Show seconds) in the
 * primary colour. The hands step, never sweep, so nothing animates (reduced
 * motion included). Its label changes once a minute.
 */
function AnalogFace({ date, size, seconds, label }: { date: Date; size: number; seconds: boolean; label: string }) {
  const a = handAngles(date, seconds)
  // Strokes are set in px and converted to the 100-unit viewBox.
  const u = 100 / size
  const px = (n: number) => n * u
  const handW = Math.min(6, Math.max(2.5, size * 0.03))
  const ticks = []
  for (let i = 0; i < 12; i++) {
    const quarter = i % 3 === 0
    ticks.push(
      <line
        key={i}
        x1={50}
        y1={4}
        x2={50}
        y2={quarter ? 13 : 9}
        stroke={quarter ? "var(--foreground)" : "var(--muted-foreground)"}
        strokeOpacity={quarter ? 0.85 : 0.6}
        strokeWidth={px(quarter ? 2 : 1.25)}
        strokeLinecap="round"
        transform={`rotate(${i * 30} 50 50)`}
      />,
    )
  }
  const minuteMarks =
    size >= 150
      ? Array.from({ length: 60 }, (_, i) =>
          i % 5 === 0 ? null : (
            <line
              key={`m${i}`}
              x1={50}
              y1={4}
              x2={50}
              y2={6.5}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.35}
              strokeWidth={px(1)}
              transform={`rotate(${i * 6} 50 50)`}
            />
          ),
        )
      : null
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} className="block overflow-visible">
      <circle cx={50} cy={50} r={50 - px(0.5)} fill="var(--card)" stroke="var(--border)" strokeWidth={px(1)} />
      {minuteMarks}
      {ticks}
      <line
        x1={50}
        y1={50 + px(handW * 1.5)}
        x2={50}
        y2={24}
        stroke="var(--foreground)"
        strokeWidth={px(handW)}
        strokeLinecap="round"
        transform={`rotate(${a.hour} 50 50)`}
      />
      <line
        x1={50}
        y1={50 + px(handW * 2)}
        x2={50}
        y2={11}
        stroke="var(--foreground)"
        strokeOpacity={0.9}
        strokeWidth={px(handW * 0.7)}
        strokeLinecap="round"
        transform={`rotate(${a.minute} 50 50)`}
      />
      {seconds && (
        <line
          x1={50}
          y1={62}
          x2={50}
          y2={8}
          stroke="var(--primary)"
          strokeWidth={px(Math.max(1, handW * 0.35))}
          strokeLinecap="round"
          transform={`rotate(${a.second} 50 50)`}
        />
      )}
      <circle cx={50} cy={50} r={px(handW * 0.9)} fill={seconds ? "var(--primary)" : "var(--foreground)"} />
    </svg>
  )
}
