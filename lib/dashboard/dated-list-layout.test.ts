import { describe, expect, it } from "vitest"
import {
  CAROUSEL_INTERVAL_MS,
  MAX_DOTS,
  SWIPE_THRESHOLD,
  datedLook,
  dotWindow,
  nextIndex,
  prevIndex,
  rowsThatFit,
  shouldAutoAdvance,
  swipeStep,
  wrapIndex,
} from "./dated-list-layout"

describe("datedLook", () => {
  it.each([
    // One row, at any width: the hero carousel.
    [2, 1, "carousel"],
    [4, 1, "carousel"],
    [12, 1, "carousel"],
    // Two rows, at any width: a headline item and compact rows.
    [2, 2, "headline"],
    [3, 2, "headline"],
    [6, 2, "headline"],
    [12, 2, "headline"],
    // Three rows or more: the list, by width.
    [2, 3, "slim"],
    [2, 8, "slim"],
    [3, 3, "condensed"],
    [3, 8, "condensed"],
    [4, 3, "full"],
    [5, 3, "full"],
    [5, 8, "full"],
    // Six columns and three rows: the card's own sized tiers, unchanged.
    [6, 3, "rich"],
    [6, 4, "rich"],
    [12, 8, "rich"],
  ] as const)("%ix%i is %s", (w, h, look) => {
    expect(datedLook({ w, h })).toBe(look)
  })

  it("treats a size below one cell as one cell", () => {
    expect(datedLook({ w: 0, h: 0 })).toBe("carousel")
    expect(datedLook({ w: Number.NaN, h: 1 })).toBe("carousel")
    expect(datedLook({ w: 1, h: 4 })).toBe("slim")
  })
})

describe("carousel index", () => {
  it("wraps at both ends", () => {
    expect(nextIndex(0, 3)).toBe(1)
    expect(nextIndex(2, 3)).toBe(0)
    expect(prevIndex(0, 3)).toBe(2)
    expect(prevIndex(1, 3)).toBe(0)
  })

  it("two items toggle", () => {
    expect(nextIndex(0, 2)).toBe(1)
    expect(nextIndex(1, 2)).toBe(0)
    expect(prevIndex(0, 2)).toBe(1)
    expect(prevIndex(1, 2)).toBe(0)
  })

  it("one item stays put; none is index 0", () => {
    expect(nextIndex(0, 1)).toBe(0)
    expect(prevIndex(0, 1)).toBe(0)
    expect(nextIndex(0, 0)).toBe(0)
    expect(prevIndex(0, 0)).toBe(0)
    expect(wrapIndex(5, 0)).toBe(0)
  })

  it("wrapIndex brings any whole number into range (a list that shrank)", () => {
    expect(wrapIndex(7, 3)).toBe(1)
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(-4, 3)).toBe(2)
    expect(wrapIndex(Number.NaN, 3)).toBe(0)
  })
})

describe("dotWindow", () => {
  it("is MAX_DOTS (7)", () => {
    expect(MAX_DOTS).toBe(7)
  })

  it("no items, no dots", () => {
    expect(dotWindow(0, 0)).toEqual([])
  })

  for (let count = 1; count <= 30; count++) {
    it(`${count} item(s): every active index is shown, in a contiguous window of at most ${MAX_DOTS}`, () => {
      for (const active of [0, 1, Math.floor(count / 2), count - 2, count - 1].filter((a) => a >= 0 && a < count)) {
        const dots = dotWindow(count, active)
        expect(dots.length).toBe(Math.min(count, MAX_DOTS))
        // Contiguous, ascending, in range.
        dots.forEach((d, i) => {
          if (i > 0) expect(d.index).toBe(dots[i - 1].index + 1)
          expect(d.index).toBeGreaterThanOrEqual(0)
          expect(d.index).toBeLessThan(count)
        })
        // Exactly one active dot, the active item.
        expect(dots.filter((d) => d.active).map((d) => d.index)).toEqual([active])
        // An edge (smaller) dot only where more items lie beyond the window on that side.
        const first = dots[0]
        const last = dots[dots.length - 1]
        expect(first.edge).toBe(first.index > 0 && !first.active)
        expect(last.edge).toBe(last.index < count - 1 && !last.active)
        for (const d of dots.slice(1, -1)) expect(d.edge).toBe(false)
      }
    })
  }

  it("keeps the active dot centred when it can, pinned at the ends", () => {
    expect(dotWindow(30, 0).map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(dotWindow(30, 15).map((d) => d.index)).toEqual([12, 13, 14, 15, 16, 17, 18])
    expect(dotWindow(30, 29).map((d) => d.index)).toEqual([23, 24, 25, 26, 27, 28, 29])
    expect(dotWindow(8, 7).map((d) => d.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("clamps an out-of-range active index", () => {
    expect(dotWindow(3, 9).filter((d) => d.active).map((d) => d.index)).toEqual([2])
    expect(dotWindow(3, -2).filter((d) => d.active).map((d) => d.index)).toEqual([0])
  })
})

describe("swipeStep", () => {
  it("threshold is 40px", () => {
    expect(SWIPE_THRESHOLD).toBe(40)
  })

  it("a horizontal swipe left goes to the next item, right to the previous", () => {
    expect(swipeStep({ dx: -40, dy: 0 })).toBe(1)
    expect(swipeStep({ dx: -120, dy: 30 })).toBe(1)
    expect(swipeStep({ dx: 40, dy: 0 })).toBe(-1)
    expect(swipeStep({ dx: 90, dy: -20 })).toBe(-1)
  })

  it("short or mostly vertical movement is not a swipe", () => {
    expect(swipeStep({ dx: -39, dy: 0 })).toBe(0)
    expect(swipeStep({ dx: 39, dy: 0 })).toBe(0)
    expect(swipeStep({ dx: 0, dy: 0 })).toBe(0)
    expect(swipeStep({ dx: -50, dy: 60 })).toBe(0)
    expect(swipeStep({ dx: 50, dy: -50 })).toBe(0)
    expect(swipeStep({ dx: Number.NaN, dy: 0 })).toBe(0)
  })

  it("takes another threshold", () => {
    expect(swipeStep({ dx: -20, dy: 0, threshold: 20 })).toBe(1)
    expect(swipeStep({ dx: -20, dy: 0, threshold: 21 })).toBe(0)
  })
})

describe("shouldAutoAdvance", () => {
  const base = { paused: false, hidden: false, reducedMotion: false, editing: false, count: 3 }

  it("advances about every 6 seconds", () => {
    expect(CAROUSEL_INTERVAL_MS).toBe(6000)
  })

  it("advances with several items and nothing holding it", () => {
    expect(shouldAutoAdvance(base)).toBe(true)
    expect(shouldAutoAdvance({ ...base, count: 2 })).toBe(true)
  })

  it("truth table: any one reason stops it", () => {
    const flags = ["paused", "hidden", "reducedMotion", "editing"] as const
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const input = { ...base }
      flags.forEach((f, i) => {
        input[f] = (mask & (1 << i)) !== 0
      })
      for (const count of [0, 1, 2, 8]) {
        expect(shouldAutoAdvance({ ...input, count }), `${JSON.stringify(input)} count ${count}`).toBe(mask === 0 && count > 1)
      }
    }
  })
})

describe("rowsThatFit", () => {
  it("counts whole rows in the room left, up to the maximum", () => {
    expect(rowsThatFit(0, 28, 2)).toBe(0)
    expect(rowsThatFit(27, 28, 2)).toBe(0)
    expect(rowsThatFit(28, 28, 2)).toBe(1)
    expect(rowsThatFit(56, 28, 2)).toBe(2)
    expect(rowsThatFit(500, 28, 2)).toBe(2)
  })

  it("is 0 for unmeasured or nonsense input", () => {
    expect(rowsThatFit(Number.NaN, 28, 2)).toBe(0)
    expect(rowsThatFit(-5, 28, 2)).toBe(0)
    expect(rowsThatFit(100, 0, 2)).toBe(0)
  })
})
