import { describe, expect, it } from "vitest"
import { moveCard, type Placement } from "./grid"
import { drawnToStored, gridPitch, moveKeyStep, resizeKeyStep, snapMove, snapResize, stepMove } from "./grid-pointer"

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

  it("moving down past the card below swaps them instead of floating back up", () => {
    // A one-row step down would float back to row 0 under gravity, so the step grows until A really moves.
    const to = stepMove(layout, "a", { x: 0, y: 1 }, 12)!
    expect(to).not.toBeNull()
    const next = moveCard(layout, "a", to, 12)
    expect(at(next, "a").y).toBeGreaterThan(at(next, "b").y)
  })

  it("moving up swaps with the card above", () => {
    const to = stepMove(layout, "b", { x: 0, y: -1 }, 12)!
    const next = moveCard(layout, "b", to, 12)
    expect(at(next, "b").y).toBe(0)
    expect(at(next, "a").y).toBeGreaterThan(0)
  })

  it("is null when the card cannot move that way", () => {
    expect(stepMove(layout, "a", { x: -1, y: 0 }, 12)).toBeNull()
    expect(stepMove(layout, "a", { x: 0, y: -1 }, 12)).toBeNull()
    expect(stepMove([p("w", 0, 0, 12, 1)], "w", { x: 1, y: 0 }, 12)).toBeNull()
    expect(stepMove([p("solo", 0, 0, 3, 1)], "solo", { x: 0, y: 1 }, 12)).toBeNull()
    expect(stepMove(layout, "missing", { x: 1, y: 0 }, 12)).toBeNull()
  })
})

describe("drawnToStored", () => {
  it("applies the drawn move to the stored origin, so hidden cards above never shift the landing", () => {
    // Drawn at row 2 (a hidden card above was compacted out), stored at row 6.
    expect(drawnToStored({ x: 4, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 6 })).toEqual({ x: 4, y: 7 })
  })

  it("is the identity when drawn and stored agree", () => {
    expect(drawnToStored({ x: 5, y: 0 }, { x: 2, y: 3 }, { x: 2, y: 3 })).toEqual({ x: 5, y: 0 })
  })

  it("never proposes a negative row or column", () => {
    expect(drawnToStored({ x: 0, y: 0 }, { x: 3, y: 5 }, { x: 1, y: 2 })).toEqual({ x: 0, y: 0 })
  })
})
