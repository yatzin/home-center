import { describe, expect, it } from "vitest"
import { clockLook, fitClock, layoutBoxes, type ClockFitInput, type ClockLook } from "./clock-layout"

describe("clockLook", () => {
  const large = (w: number, h: number, face: "auto" | "always" | "never" = "auto") => clockLook({ w, h }, "large", face)
  const phone = (w: number, h: number, face: "auto" | "always" | "never" = "auto") => clockLook({ w, h }, "phone", face)

  it.each([
    [1, 1, "time"],
    [1, 2, "time"],
    [1, 4, "time"],
    [2, 1, "standard"],
    [3, 1, "standard"],
    [4, 1, "standard"],
    [2, 2, "face"],
    [3, 2, "face"],
    [2, 3, "face"],
    [3, 3, "face"],
    [4, 3, "face"],
    [4, 4, "face"],
  ] as const)("large %ix%i (face auto): %s", (w, h, look) => {
    expect(large(w, h)).toBe(look)
  })

  it("never: digital only, at every size", () => {
    expect(large(1, 1, "never")).toBe("time")
    expect(large(2, 1, "never")).toBe("standard")
    expect(large(2, 2, "never")).toBe("standard")
    expect(large(4, 4, "never")).toBe("standard")
  })

  it("always: the face beside the time on one row from 3 columns; below that, as auto", () => {
    expect(large(1, 1, "always")).toBe("time")
    expect(large(2, 1, "always")).toBe("standard")
    expect(large(3, 1, "always")).toBe("face")
    expect(large(4, 1, "always")).toBe("face")
    expect(large(2, 2, "always")).toBe("face")
  })

  it("phone: a column counts double (a half-width phone card is about two large columns)", () => {
    expect(phone(1, 1)).toBe("standard")
    expect(phone(2, 1)).toBe("standard")
    expect(phone(1, 2)).toBe("face")
    expect(phone(2, 2)).toBe("face")
    expect(phone(2, 1, "always")).toBe("face")
    expect(phone(1, 1, "always")).toBe("standard")
    expect(phone(2, 4, "never")).toBe("standard")
  })
})

// Content boxes (inside the card's padding) at real sizes: a ~1200px canvas
// has ~85px columns, rows are 88px, gaps 16px.
const col = (w: number) => w * 85 + (w - 1) * 16
const row = (h: number) => h * 88 + (h - 1) * 16
const DATES = ["Tuesday, Oct 27, 2026", "Tue, Oct 27, 2026", "Oct 27, 2026", "Oct 27"]

function input(look: ClockLook, width: number, height: number, o: Partial<ClockFitInput> = {}): ClockFitInput {
  return { look, width, height, showDate: true, seconds: false, period: true, edit: true, dates: DATES, ...o }
}

/** Every estimated box inside the content box, and nothing overlapping the Edit button. */
function expectFits(i: ClockFitInput) {
  const fit = fitClock(i)
  const b = layoutBoxes(fit, i)
  const inside = (r: { x: number; y: number; w: number; h: number }) => {
    expect(r.x).toBeGreaterThanOrEqual(-0.5)
    expect(r.y).toBeGreaterThanOrEqual(-0.5)
    expect(r.x + r.w).toBeLessThanOrEqual(i.width + 0.5)
    expect(r.y + r.h).toBeLessThanOrEqual(i.height + 0.5)
  }
  for (const r of [b.time, b.date, b.face, b.edit]) if (r) inside(r)
  if (b.edit) {
    const overlaps = (r: { x: number; y: number; w: number; h: number }) =>
      r.x < b.edit!.x + b.edit!.w && b.edit!.x < r.x + r.w && r.y < b.edit!.y + b.edit!.h && b.edit!.y < r.y + r.h
    expect(overlaps(b.time)).toBe(false)
    if (b.date) expect(overlaps(b.date)).toBe(false)
    if (b.face) {
      // The face is a circle: its square's corner may sit under the button.
      const r = b.face.w / 2
      const cx = b.face.x + r
      const cy = b.face.y + r
      const nx = Math.max(b.edit.x, Math.min(cx, b.edit.x + b.edit.w))
      const ny = Math.max(b.edit.y, Math.min(cy, b.edit.y + b.edit.h))
      expect(Math.hypot(cx - nx, cy - ny)).toBeGreaterThanOrEqual(r - 0.5)
    }
  }
  return fit
}

describe("fitClock", () => {
  it("2x1, the default: a big time with the full date under it and a compact Edit button", () => {
    const fit = expectFits(input("standard", col(2) - 28, row(1) - 24))
    expect(fit.look).toBe("standard")
    expect(fit.timePx).toBeGreaterThanOrEqual(26)
    expect(fit.date).not.toBeNull()
    expect(fit.datePx).toBeGreaterThanOrEqual(11)
    expect(fit.editLabel).toBe(false)
  })

  it("4x1: room for the weekday and a labelled Edit button", () => {
    const fit = expectFits(input("standard", col(4) - 40, row(1) - 24))
    expect(fit.date).toBe("Tuesday, Oct 27, 2026")
    expect(fit.editLabel).toBe(true)
  })

  it("1x1: the time alone (no date), still readable, under a compact Edit button", () => {
    const fit = expectFits(input("time", col(1) - 16, row(1) - 16))
    expect(fit.date).toBeNull()
    expect(fit.timePx).toBeGreaterThanOrEqual(16)
    expect(fit.editLabel).toBe(false)
  })

  it("1x1 in 12h: the AM/PM goes under the time when that makes the time bigger", () => {
    const fit = fitClock(input("time", col(1) - 16, row(1) - 16, { edit: false }))
    expect(fit.suffix).toBe("stacked")
  })

  it("1 wide and tall: the time with a short date", () => {
    const fit = expectFits(input("time", col(1) - 16, row(3) - 16))
    expect(fit.date).not.toBeNull()
  })

  it("2x2: an analog face over the time", () => {
    const fit = expectFits(input("face", col(2) - 28, row(2) - 24))
    expect(fit.look).toBe("face")
    expect(fit.direction).toBe("column")
    expect(fit.face).toBeGreaterThanOrEqual(64)
  })

  it("4x2: the face beside the time", () => {
    const fit = expectFits(input("face", col(4) - 40, row(2) - 24))
    expect(fit.direction).toBe("row")
    expect(fit.face).toBeGreaterThanOrEqual(120)
  })

  it("4x4: generous", () => {
    const fit = expectFits(input("face", col(4) - 40, row(4) - 24))
    expect(fit.face).toBeGreaterThanOrEqual(200)
    expect(fit.timePx).toBeGreaterThanOrEqual(32)
  })

  it("3x1 with face always: a small face beside the time", () => {
    const fit = expectFits(input("face", col(3) - 40, row(1) - 24))
    expect(fit.direction).toBe("row")
    expect(fit.face).toBeGreaterThan(0)
  })

  it("drops the face when it would be too small to read, rather than squeeze it", () => {
    const fit = expectFits(input("face", 150, 70))
    expect(fit.face).toBe(0)
    expect(fit.look).toBe("standard")
  })

  it("without the date: no date line", () => {
    const fit = expectFits(input("standard", col(2) - 28, row(1) - 24, { showDate: false }))
    expect(fit.date).toBeNull()
    expect(fit.datePx).toBe(0)
  })

  it("seconds and 24h change the time's width, not the fit's safety", () => {
    for (const seconds of [true, false])
      for (const period of [true, false])
        for (const edit of [true, false]) expectFits(input("standard", col(2) - 28, row(1) - 24, { seconds, period, edit }))
  })

  it("never overflows and never overlaps the button, at any box", () => {
    for (const look of ["time", "standard", "face"] as const)
      for (let w = 40; w <= 900; w += 37)
        for (let h = 40; h <= 800; h += 41)
          for (const edit of [true, false])
            for (const seconds of [true, false]) expectFits(input(look, w, h, { edit, seconds, period: !seconds }))
  })

  it("grows with its box", () => {
    let last = 0
    for (let w = 120; w <= 600; w += 40) {
      const fit = fitClock(input("standard", w, 64))
      expect(fit.timePx).toBeGreaterThanOrEqual(last)
      last = fit.timePx
    }
  })

  it("an unmeasured box (0 x 0, before the first layout) gives nothing to draw, not NaN", () => {
    const fit = fitClock(input("face", 0, 0))
    for (const v of [fit.timePx, fit.datePx, fit.face]) expect(Number.isFinite(v)).toBe(true)
  })
})
