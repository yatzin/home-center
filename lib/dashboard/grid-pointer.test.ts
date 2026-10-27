import { describe, expect, it } from "vitest"
import { moveCard, type Placement } from "./grid"
import {
  drawnToStored,
  gridPitch,
  moveKeyStep,
  nearestStripRow,
  resizeKeyStep,
  snapMove,
  snapResize,
  stepMove,
  stripRows,
  stripRowTop,
} from "./grid-pointer"

const p = (id: string, x: number, y: number, w: number, h: number): Placement => ({ id, x, y, w, h })

describe("gridPitch", () => {
  it("is one column plus its gap across, one row plus its gap down", () => {
    // 12 columns of 50px with 11 gaps of 16px = 776px wide.
    expect(gridPitch(776, 12, 88, 16)).toEqual({ x: 66, y: 104 })
  })

  it("is zero across for an unmeasured or negative width, never NaN", () => {
    expect(gridPitch(0, 12, 88, 16)).toEqual({ x: 0, y: 104 })
    expect(gridPitch(-50, 12, 88, 16)).toEqual({ x: 0, y: 104 })
    expect(gridPitch(Number.NaN, 12, 88, 16)).toEqual({ x: 0, y: 104 })
  })
})

describe("snapMove", () => {
  const pitch = { x: 66, y: 104 }
  const origin = { x: 2, y: 3, w: 3 }

  it("stays put for a small wobble", () => {
    expect(snapMove(origin, { x: 10, y: -20 }, pitch, 12)).toEqual({ x: 2, y: 3 })
  })

  it("snaps to the nearest cell once past half a cell", () => {
    expect(snapMove(origin, { x: 34, y: 53 }, pitch, 12)).toEqual({ x: 3, y: 4 })
    expect(snapMove(origin, { x: -140, y: -210 }, pitch, 12)).toEqual({ x: 0, y: 1 })
  })

  it("keeps the whole card inside the grid", () => {
    expect(snapMove(origin, { x: 5000, y: 0 }, pitch, 12)).toEqual({ x: 9, y: 3 })
    expect(snapMove(origin, { x: -5000, y: -5000 }, pitch, 12)).toEqual({ x: 0, y: 0 })
  })

  it("does not move on a zero or non-finite pitch or delta", () => {
    expect(snapMove(origin, { x: 300, y: 300 }, { x: 0, y: 0 }, 12)).toEqual({ x: 2, y: 3 })
    expect(snapMove(origin, { x: Number.NaN, y: Infinity }, pitch, 12)).toEqual({ x: 2, y: 3 })
  })
})

describe("snapResize", () => {
  const pitch = { x: 66, y: 104 }
  const origin = { w: 3, h: 2 }

  it("right edge changes only the width", () => {
    expect(snapResize(origin, { x: 140, y: 400 }, "right", pitch)).toEqual({ w: 5, h: 2 })
  })

  it("bottom edge changes only the height", () => {
    expect(snapResize(origin, { x: 400, y: 110 }, "bottom", pitch)).toEqual({ w: 3, h: 3 })
  })

  it("corner changes both", () => {
    expect(snapResize(origin, { x: -70, y: 210 }, "corner", pitch)).toEqual({ w: 2, h: 4 })
  })

  it("never goes below 1x1 (limits are the reducer's job)", () => {
    expect(snapResize(origin, { x: -9000, y: -9000 }, "corner", pitch)).toEqual({ w: 1, h: 1 })
  })

  it("ignores a zero pitch or non-finite delta", () => {
    expect(snapResize(origin, { x: 500, y: 500 }, "corner", { x: 0, y: 0 })).toEqual(origin)
    expect(snapResize(origin, { x: Number.NaN, y: -Infinity }, "corner", pitch)).toEqual(origin)
  })
})

describe("moveKeyStep / resizeKeyStep", () => {
  it("maps arrow keys to one-cell steps", () => {
    expect(moveKeyStep("ArrowLeft")).toEqual({ x: -1, y: 0 })
    expect(moveKeyStep("ArrowRight")).toEqual({ x: 1, y: 0 })
    expect(moveKeyStep("ArrowUp")).toEqual({ x: 0, y: -1 })
    expect(moveKeyStep("ArrowDown")).toEqual({ x: 0, y: 1 })
    expect(moveKeyStep("Enter")).toBeNull()
  })

  it("lets each handle change only its own axis", () => {
    expect(resizeKeyStep("right", "ArrowRight")).toEqual({ w: 1, h: 0 })
    expect(resizeKeyStep("right", "ArrowLeft")).toEqual({ w: -1, h: 0 })
    expect(resizeKeyStep("right", "ArrowDown")).toBeNull()
    expect(resizeKeyStep("bottom", "ArrowDown")).toEqual({ w: 0, h: 1 })
    expect(resizeKeyStep("bottom", "ArrowUp")).toEqual({ w: 0, h: -1 })
    expect(resizeKeyStep("bottom", "ArrowLeft")).toBeNull()
    expect(resizeKeyStep("corner", "ArrowLeft")).toEqual({ w: -1, h: 0 })
    expect(resizeKeyStep("corner", "ArrowDown")).toEqual({ w: 0, h: 1 })
    expect(resizeKeyStep("corner", "Tab")).toBeNull()
  })
})

describe("stepMove", () => {
  // A over B in column 0; C beside them.
  const layout = [p("a", 0, 0, 3, 2), p("b", 0, 2, 3, 2), p("c", 3, 0, 3, 1)]
  const at = (ps: Placement[], id: string) => ps.find((q) => q.id === id)!

  it("moves right by one column", () => {
    const to = stepMove(layout, "a", { x: 1, y: 0 }, 12)
    expect(to).toEqual({ x: 1, y: 0 })
  })

  it("moving down one row leaves an empty row above and pushes the card below down", () => {
    const to = stepMove(layout, "a", { x: 0, y: 1 }, 12)!
    expect(to).toEqual({ x: 0, y: 1 })
    const next = moveCard(layout, "a", to, 12)
    expect(at(next, "a").y).toBe(1)
    expect(at(next, "b").y).toBe(3)
    expect(at(next, "c").y).toBe(0)
  })

  it("moving up one row pushes the card above down out of its way", () => {
    const to = stepMove(layout, "b", { x: 0, y: -1 }, 12)!
    expect(to).toEqual({ x: 0, y: 1 })
    const next = moveCard(layout, "b", to, 12)
    expect(at(next, "b").y).toBe(1)
    expect(at(next, "a").y).toBeGreaterThan(at(next, "b").y)
  })

  it("moves a lone card down into empty rows, up to the 5-row gap cap", () => {
    expect(stepMove([p("solo", 0, 0, 3, 1)], "solo", { x: 0, y: 1 }, 12)).toEqual({ x: 0, y: 1 })
    expect(stepMove([p("solo", 0, 4, 3, 1)], "solo", { x: 0, y: 1 }, 12)).toEqual({ x: 0, y: 5 })
    expect(stepMove([p("solo", 0, 5, 3, 1)], "solo", { x: 0, y: 1 }, 12)).toBeNull()
  })

  it("at the gap cap, moving down jumps past the card below", () => {
    const ps = [p("a", 0, 5, 3, 1), p("b", 0, 6, 3, 2)]
    const to = stepMove(ps, "a", { x: 0, y: 1 }, 12)!
    const next = moveCard(ps, "a", to, 12)
    expect(at(next, "a").y).toBeGreaterThan(at(next, "b").y)
  })

  it("is null when the card cannot move that way", () => {
    expect(stepMove(layout, "a", { x: -1, y: 0 }, 12)).toBeNull()
    expect(stepMove(layout, "a", { x: 0, y: -1 }, 12)).toBeNull()
    expect(stepMove([p("w", 0, 0, 12, 1)], "w", { x: 1, y: 0 }, 12)).toBeNull()
    expect(stepMove(layout, "missing", { x: 1, y: 0 }, 12)).toBeNull()
  })
})

describe("drawnToStored", () => {
  it("applies the drawn move to the stored origin, so hidden cards above never shift the landing", () => {
    // Drawn at row 2 (the rows of a hidden card above were closed), stored at row 6.
    expect(drawnToStored({ x: 4, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 6 })).toEqual({ x: 4, y: 7 })
  })

  it("is the identity when drawn and stored agree", () => {
    expect(drawnToStored({ x: 5, y: 0 }, { x: 2, y: 3 }, { x: 2, y: 3 })).toEqual({ x: 5, y: 0 })
  })

  it("never proposes a negative row or column", () => {
    expect(drawnToStored({ x: 0, y: 0 }, { x: 3, y: 5 }, { x: 1, y: 2 })).toEqual({ x: 0, y: 0 })
  })
})

describe("phone editor rows (a control strip above every row where a card starts)", () => {
  // Phone: A (rows 0-3), B (row 4-5), then C and D side by side at row 6.
  const layout = [p("a", 0, 0, 2, 4), p("b", 0, 4, 2, 2), p("c", 0, 6, 1, 1), p("d", 1, 6, 1, 3)]
  const pitchY = 104
  const strip = 48

  it("stripRows lists each starting row once, ascending, whatever the input order", () => {
    expect(stripRows(layout)).toEqual([0, 4, 6])
    expect(stripRows([...layout].reverse())).toEqual([0, 4, 6])
    expect(stripRows([])).toEqual([])
  })

  it("stripRowTop adds one strip for every starting row at or above the row", () => {
    const strips = stripRows(layout)
    expect(stripRowTop(0, strips, pitchY, strip)).toBe(48)
    expect(stripRowTop(3, strips, pitchY, strip)).toBe(3 * 104 + 48)
    expect(stripRowTop(4, strips, pitchY, strip)).toBe(4 * 104 + 96)
    expect(stripRowTop(6, strips, pitchY, strip)).toBe(6 * 104 + 144)
    expect(stripRowTop(9, strips, pitchY, strip)).toBe(9 * 104 + 144)
  })

  it("stripRowTop never decreases down the grid, so cards drawn at those tops never overlap", () => {
    const strips = stripRows(layout)
    for (let y = 1; y < 12; y++)
      expect(stripRowTop(y, strips, pitchY, strip) - stripRowTop(y - 1, strips, pitchY, strip)).toBeGreaterThanOrEqual(pitchY)
  })

  it("nearestStripRow picks the row whose top is nearest, within 0..maxRow", () => {
    const strips = stripRows(layout)
    const top = (y: number) => stripRowTop(y, strips, pitchY, strip)
    expect(nearestStripRow(top(4), strips, pitchY, strip, 9)).toBe(4)
    expect(nearestStripRow(top(4) + 40, strips, pitchY, strip, 9)).toBe(4)
    expect(nearestStripRow(top(4) - 40, strips, pitchY, strip, 9)).toBe(4)
    expect(nearestStripRow(top(5) - 10, strips, pitchY, strip, 9)).toBe(5)
    expect(nearestStripRow(-500, strips, pitchY, strip, 9)).toBe(0)
    expect(nearestStripRow(99_999, strips, pitchY, strip, 9)).toBe(9)
  })

  it("nearestStripRow treats a non-finite position as the top, and a negative maxRow as 0", () => {
    const strips = stripRows(layout)
    expect(nearestStripRow(Number.NaN, strips, pitchY, strip, 9)).toBe(0)
    expect(nearestStripRow(300, strips, pitchY, strip, -1)).toBe(0)
  })
})
