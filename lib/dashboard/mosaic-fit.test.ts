import { describe, expect, it } from "vitest"
import { mosaicFit } from "./mosaic-fit"

describe("mosaicFit", () => {
  it("shows all 18 loaded items of 32 when the box has room (the reported case)", () => {
    const r = mosaicFit({ width: 600, height: 300, itemCount: 18, total: 32 })
    expect(r.visible).toBe(18)
    expect(r.hidden).toBe(14)
    expect(r.cols * r.rows).toBeGreaterThanOrEqual(18)
  })

  it("shows fewer when the box is small", () => {
    const r = mosaicFit({ width: 160, height: 160, itemCount: 18, total: 32 })
    expect(r.visible).toBe(4)
    expect(r.hidden).toBe(28)
  })

  it("grows with the box", () => {
    const small = mosaicFit({ width: 240, height: 160, itemCount: 18, total: 18 })
    const big = mosaicFit({ width: 600, height: 400, itemCount: 18, total: 18 })
    expect(big.visible).toBeGreaterThan(small.visible)
  })

  it("one item fills the box", () => {
    expect(mosaicFit({ width: 400, height: 300, itemCount: 1, total: 1 })).toEqual({ cols: 1, rows: 1, visible: 1, hidden: 0, lastSpan: 1 })
  })

  it("zero items", () => {
    const r = mosaicFit({ width: 400, height: 300, itemCount: 0, total: 0 })
    expect(r.visible).toBe(0)
    expect(r.hidden).toBe(0)
    expect(r.cols).toBeGreaterThanOrEqual(1)
  })

  it("tiny, zero and NaN sizes still give one tile", () => {
    for (const [width, height] of [[0, 0], [10, 10], [NaN, NaN], [-5, 40], [Infinity, NaN]]) {
      const r = mosaicFit({ width, height, itemCount: 5, total: 5 })
      expect(r.visible).toBe(1)
      expect(r.cols).toBe(1)
      expect(r.rows).toBe(1)
      expect(r.hidden).toBe(4)
    }
  })

  it("shrinks the grid to the item count so tiles fill the box", () => {
    const r = mosaicFit({ width: 600, height: 300, itemCount: 2, total: 2 })
    expect(r.visible).toBe(2)
    expect(r.cols * r.rows).toBe(2)
    const three = mosaicFit({ width: 600, height: 300, itemCount: 3, total: 3 })
    expect(three.cols * three.rows).toBeLessThanOrEqual(4)
    expect(three.cols * three.rows).toBeGreaterThanOrEqual(3)
  })

  it("counts items beyond the loaded ones as hidden", () => {
    const r = mosaicFit({ width: 600, height: 400, itemCount: 5, total: 40 })
    expect(r.visible).toBe(5)
    expect(r.hidden).toBe(35)
  })

  it("never reports negative hidden", () => {
    expect(mosaicFit({ width: 600, height: 400, itemCount: 5, total: 2 }).hidden).toBe(0)
  })

  it("lets the last tile span the empty cells of the last row so the box has no gaps", () => {
    for (const [w, h, n] of [[377, 217, 5], [475, 217, 3], [500, 300, 7], [300, 300, 4], [600, 400, 11]]) {
      const r = mosaicFit({ width: w, height: h, itemCount: n, total: n })
      const inLastRow = ((n - 1) % r.cols) + 1
      expect(r.lastSpan).toBe(r.cols - inLastRow + 1)
    }
    expect(mosaicFit({ width: 377, height: 217, itemCount: 5, total: 5 })).toMatchObject({ cols: 3, rows: 2, lastSpan: 2 })
  })

  it("never leaves a whole empty row", () => {
    const a = mosaicFit({ width: 150, height: 230, itemCount: 4, total: 4 })
    expect(a.visible).toBe(4)
    expect(a.rows).toBeLessThanOrEqual(Math.ceil(a.visible / a.cols))
    const b = mosaicFit({ width: 160, height: 400, itemCount: 5, total: 5 })
    expect(b.visible).toBe(5)
    expect(b.rows).toBeLessThanOrEqual(Math.ceil(b.visible / b.cols))
    for (let w = 80; w <= 700; w += 37)
      for (let h = 80; h <= 500; h += 41)
        for (let n = 2; n <= 20; n++) {
          const r = mosaicFit({ width: w, height: h, itemCount: n, total: n })
          expect(r.rows).toBeLessThanOrEqual(Math.ceil(r.visible / r.cols))
        }
  })
})
