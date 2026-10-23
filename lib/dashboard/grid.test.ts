import { describe, expect, it } from "vitest"
import {
  LARGE_COLS,
  PHONE_COLS,
  appendCard,
  compact,
  deriveRowMajor,
  moveCard,
  moveInOrder,
  removeCard,
  resizeCard,
  resolveOverlaps,
  type Limits,
  type Placement,
} from "./grid"

const p = (id: string, x: number, y: number, w: number, h: number): Placement => ({ id, x, y, w, h })

function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// Every grid operation must hand back a layout that satisfies this.
function assertValid(ps: Placement[], cols: number): void {
  const ids = new Set<string>()
  for (const c of ps) {
    expect(ids.has(c.id), `duplicate id ${c.id}`).toBe(false)
    ids.add(c.id)
    for (const n of [c.x, c.y, c.w, c.h]) expect(Number.isInteger(n), `${c.id} non-integer`).toBe(true)
    expect(c.x, `${c.id} x`).toBeGreaterThanOrEqual(0)
    expect(c.y, `${c.id} y`).toBeGreaterThanOrEqual(0)
    expect(c.w, `${c.id} w`).toBeGreaterThanOrEqual(1)
    expect(c.h, `${c.id} h`).toBeGreaterThanOrEqual(1)
    expect(c.x + c.w, `${c.id} right edge`).toBeLessThanOrEqual(cols)
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      expect(overlaps(ps[i], ps[j]), `${ps[i].id} overlaps ${ps[j].id}`).toBe(false)
    }
  }
}

// No card could move up a row without colliding.
function assertCompact(ps: Placement[]): void {
  for (const c of ps) {
    if (c.y === 0) continue
    const lifted = { ...c, y: c.y - 1 }
    expect(
      ps.some((o) => o.id !== c.id && overlaps(lifted, o)),
      `${c.id} could rise`,
    ).toBe(true)
  }
}

const byId = (ps: Placement[]) => Object.fromEntries(ps.map((c) => [c.id, c]))

function freeze(ps: Placement[]): Placement[] {
  return Object.freeze(ps.map((c) => Object.freeze({ ...c }))) as Placement[]
}

describe("grid constants", () => {
  it("has a 12-column large grid and a 2-column phone grid", () => {
    expect(LARGE_COLS).toBe(12)
    expect(PHONE_COLS).toBe(2)
  })
})

describe("resolveOverlaps", () => {
  it("keeps the top-left card and pushes the colliding one down", () => {
    const out = resolveOverlaps([p("b", 3, 1, 6, 2), p("a", 0, 0, 6, 2)], 12)
    assertValid(out, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 6, 2))
    expect(byId(out).b).toEqual(p("b", 3, 2, 6, 2))
  })

  it("pulls out-of-bounds cards into the grid", () => {
    const out = resolveOverlaps([p("a", 10, -3, 6, 2), p("b", -2, 5, 20, 1)], 12)
    assertValid(out, 12)
    expect(byId(out).a).toEqual(p("a", 6, 0, 6, 2))
    expect(byId(out).b).toEqual(p("b", 0, 5, 12, 1))
  })

  it("separates a stack of identical cards", () => {
    const out = resolveOverlaps([p("a", 0, 0, 4, 2), p("b", 0, 0, 4, 2), p("c", 0, 0, 4, 2)], 12)
    assertValid(out, 12)
    expect(out.map((c) => c.y)).toEqual([0, 2, 4])
  })

  it("keeps input order and drops duplicate ids", () => {
    const out = resolveOverlaps([p("b", 6, 0, 6, 1), p("a", 0, 0, 6, 1), p("a", 0, 4, 6, 1)], 12)
    assertValid(out, 12)
    expect(out.map((c) => c.id)).toEqual(["b", "a"])
    expect(byId(out).a.y).toBe(0)
  })
})

describe("compact", () => {
  it("lifts cards into the holes above them", () => {
    const out = compact([p("a", 0, 3, 6, 2), p("b", 0, 8, 6, 2), p("c", 6, 5, 6, 3)], 12)
    assertValid(out, 12)
    assertCompact(out)
    expect(byId(out).a.y).toBe(0)
    expect(byId(out).b.y).toBe(2)
    expect(byId(out).c.y).toBe(0)
  })

  it("does not let a card jump over another", () => {
    const out = compact([p("a", 0, 0, 12, 1), p("b", 0, 4, 6, 1)], 12)
    expect(byId(out).b.y).toBe(1)
  })

  it("returns new objects and never mutates its input", () => {
    const input = freeze([p("a", 0, 3, 6, 2)])
    const out = compact(input, 12)
    expect(out).not.toBe(input)
    expect(out[0]).not.toBe(input[0])
    expect(input[0].y).toBe(3)
  })
})

describe("moveCard", () => {
  it("wins an occupied slot and pushes the occupant down", () => {
    const out = moveCard(freeze([p("a", 0, 0, 6, 2), p("b", 6, 0, 6, 2)]), "a", { x: 6, y: 0 }, 12)
    assertValid(out, 12)
    assertCompact(out)
    expect(byId(out).a).toEqual(p("a", 6, 0, 6, 2))
    expect(byId(out).b).toEqual(p("b", 6, 2, 6, 2))
  })

  it("swaps with the card below when dragged down onto it", () => {
    const out = moveCard([p("a", 0, 0, 12, 2), p("b", 0, 2, 12, 2)], "a", { x: 0, y: 2 }, 12)
    assertValid(out, 12)
    expect(byId(out).b.y).toBe(0)
    expect(byId(out).a.y).toBe(2)
  })

  it("swaps with the card above when dragged up onto it", () => {
    const out = moveCard([p("a", 0, 0, 12, 2), p("b", 0, 2, 12, 2)], "b", { x: 0, y: 0 }, 12)
    assertValid(out, 12)
    expect(byId(out).b.y).toBe(0)
    expect(byId(out).a.y).toBe(2)
  })

  it("clamps a move beyond the right edge", () => {
    const out = moveCard([p("a", 0, 0, 4, 2)], "a", { x: 20, y: 0 }, 12)
    expect(byId(out).a).toEqual(p("a", 8, 0, 4, 2))
  })

  it("clamps a move past the left and top edges", () => {
    const out = moveCard([p("a", 4, 0, 4, 2)], "a", { x: -5, y: -3 }, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 4, 2))
  })

  it("lets a moved card fall to the bottom of the stack, not below it", () => {
    const out = moveCard([p("a", 0, 0, 12, 1), p("b", 0, 1, 12, 1)], "a", { x: 0, y: 50 }, 12)
    expect(byId(out).b.y).toBe(0)
    expect(byId(out).a.y).toBe(1)
  })

  it("returns an unchanged copy for an unknown id", () => {
    const input = [p("a", 0, 0, 4, 2)]
    expect(moveCard(input, "zzz", { x: 4, y: 0 }, 12)).toEqual(input)
  })
})

describe("resizeCard", () => {
  const limits: Limits = { min: { w: 2, h: 1 }, max: { w: 8, h: 4 } }

  it("clamps to the minimum size", () => {
    const out = resizeCard([p("a", 0, 0, 4, 2)], "a", { w: 1, h: 0 }, limits, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 2, 1))
  })

  it("clamps to the maximum size", () => {
    const out = resizeCard([p("a", 0, 0, 4, 2)], "a", { w: 20, h: 20 }, limits, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 8, 4))
  })

  it("clamps to the column count", () => {
    const wide: Limits = { min: { w: 1, h: 1 }, max: { w: 24, h: 4 } }
    const out = resizeCard([p("a", 0, 0, 4, 2)], "a", { w: 20, h: 2 }, wide, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 12, 2))
  })

  it("pushes a neighbour below instead of overlapping it", () => {
    const out = resizeCard([p("a", 0, 0, 6, 2), p("b", 6, 0, 6, 2)], "a", { w: 8, h: 2 }, limits, 12)
    assertValid(out, 12)
    expect(byId(out).a).toEqual(p("a", 0, 0, 8, 2))
    expect(byId(out).b).toEqual(p("b", 6, 2, 6, 2))
  })

  it("cannot grow a card at the right edge past the column count", () => {
    const out = resizeCard([p("a", 8, 0, 4, 2)], "a", { w: 8, h: 2 }, limits, 12)
    assertValid(out, 12)
    expect(byId(out).a).toEqual(p("a", 8, 0, 4, 2))
  })

  it("shifts a card left when its minimum width does not fit at its column", () => {
    const big: Limits = { min: { w: 6, h: 1 }, max: { w: 12, h: 4 } }
    const out = resizeCard([p("a", 10, 0, 2, 2)], "a", { w: 6, h: 2 }, big, 12)
    assertValid(out, 12)
    expect(byId(out).a).toEqual(p("a", 6, 0, 6, 2))
  })

  it("lifts the cards below when a card shrinks", () => {
    const out = resizeCard([p("a", 0, 0, 12, 4), p("b", 0, 4, 12, 2)], "a", { w: 12, h: 1 }, { min: { w: 1, h: 1 }, max: { w: 12, h: 4 } }, 12)
    expect(byId(out).b.y).toBe(1)
  })
})

describe("appendCard and removeCard", () => {
  it("appends at the bottom", () => {
    const out = appendCard([p("a", 0, 0, 12, 2), p("b", 0, 2, 12, 3)], "c", { w: 4, h: 2 }, 12)
    assertValid(out, 12)
    expect(out.map((c) => c.id)).toEqual(["a", "b", "c"])
    expect(byId(out).c).toEqual(p("c", 0, 5, 4, 2))
  })

  it("clamps an appended card to the grid", () => {
    const out = appendCard([], "c", { w: 30, h: 0 }, 12)
    expect(out).toEqual([p("c", 0, 0, 12, 1)])
  })

  it("ignores an id that is already placed", () => {
    const input = [p("a", 0, 0, 12, 2)]
    expect(appendCard(input, "a", { w: 4, h: 4 }, 12)).toEqual(input)
  })

  it("removes a card and closes the gap", () => {
    const out = removeCard([p("a", 0, 0, 12, 2), p("b", 0, 2, 12, 3)], "a", 12)
    expect(out).toEqual([p("b", 0, 0, 12, 3)])
  })
})

describe("deriveRowMajor", () => {
  it("orders by y then x, full width by default", () => {
    const large = [p("c", 0, 4, 12, 3), p("b", 6, 0, 6, 2), p("a", 0, 0, 6, 4)]
    const out = deriveRowMajor(large, new Map())
    assertValid(out, PHONE_COLS)
    expect(out).toEqual([p("a", 0, 0, 2, 4), p("b", 0, 4, 2, 2), p("c", 0, 6, 2, 3)])
  })

  it("uses the phone default size, letting narrow cards share a row", () => {
    const large = [p("a", 0, 0, 4, 2), p("b", 4, 0, 4, 2), p("c", 8, 0, 4, 2)]
    const defaults = new Map([
      ["a", { w: 1, h: 1 }],
      ["b", { w: 1, h: 2 }],
      ["c", { w: 2, h: 3 }],
    ])
    const out = deriveRowMajor(large, defaults)
    assertValid(out, PHONE_COLS)
    expect(out).toEqual([p("a", 0, 0, 1, 1), p("b", 1, 0, 1, 2), p("c", 0, 2, 2, 3)])
  })

  it("never lets a phone default exceed the phone grid", () => {
    const out = deriveRowMajor([p("a", 0, 0, 12, 2)], new Map([["a", { w: 5, h: 2 }]]))
    expect(out).toEqual([p("a", 0, 0, 2, 2)])
  })
})

describe("moveInOrder", () => {
  const phone = [p("a", 0, 0, 2, 2), p("b", 0, 2, 2, 1), p("c", 0, 3, 2, 3)]

  it("is a no-op for the first card moving up", () => {
    expect(moveInOrder(phone, "a", -1, PHONE_COLS)).toEqual(phone)
  })

  it("is a no-op for the last card moving down", () => {
    expect(moveInOrder(phone, "c", 1, PHONE_COLS)).toEqual(phone)
  })

  it("swaps with the next card", () => {
    const out = moveInOrder(freeze(phone), "a", 1, PHONE_COLS)
    assertValid(out, PHONE_COLS)
    expect(byId(out).b).toEqual(p("b", 0, 0, 2, 1))
    expect(byId(out).a).toEqual(p("a", 0, 1, 2, 2))
    expect(byId(out).c).toEqual(p("c", 0, 3, 2, 3))
  })

  it("swaps with the previous card", () => {
    const out = moveInOrder(phone, "c", -1, PHONE_COLS)
    assertValid(out, PHONE_COLS)
    expect(byId(out).c.y).toBe(2)
    expect(byId(out).b.y).toBe(5)
  })
})

// Tiny deterministic PRNG so the randomized run is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe("randomized operation sequence", () => {
  for (const [cols, seed] of [
    [LARGE_COLS, 1],
    [LARGE_COLS, 42],
    [PHONE_COLS, 7],
  ] as const) {
    it(`stays valid over 200 operations (cols ${cols}, seed ${seed})`, () => {
      const rand = mulberry32(seed)
      const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
      const limits: Limits = { min: { w: 1, h: 1 }, max: { w: cols, h: 6 } }

      let ps: Placement[] = []
      for (let i = 0; i < 8; i++) ps = appendCard(ps, `c${i}`, { w: int(1, cols), h: int(1, 4) }, cols)
      assertValid(ps, cols)
      let next = 8

      for (let step = 0; step < 200; step++) {
        const input = freeze(ps)
        const id = input.length ? input[int(0, input.length - 1)].id : "none"
        const op = int(0, 6)
        let out: Placement[]
        if (op === 0) {
          const to = { x: int(-3, cols + 3), y: int(-3, 25) }
          out = moveCard(input, id, to, cols)
          const moved = byId(out)[id]
          const w = byId(input)[id].w
          expect(moved.x).toBe(Math.min(Math.max(to.x, 0), cols - w))
          expect(moved.y).toBeLessThanOrEqual(Math.max(to.y, 0))
          assertCompact(out)
        } else if (op === 1) {
          out = resizeCard(input, id, { w: int(0, cols + 3), h: int(0, 8) }, limits, cols)
          assertCompact(out)
        } else if (op === 2) {
          out = removeCard(input, id, cols)
          expect(out.length).toBe(input.length - 1)
          assertCompact(out)
        } else if (op === 3) {
          out = appendCard(input, `c${next++}`, { w: int(1, cols + 2), h: int(1, 4) }, cols)
          expect(out.length).toBe(input.length + 1)
        } else if (op === 4) {
          out = moveInOrder(input, id, rand() < 0.5 ? -1 : 1, cols)
        } else if (op === 5) {
          out = compact(input, cols)
          assertCompact(out)
        } else {
          const messy = input.map((c) => ({ ...c, x: c.x + int(-2, 2), y: c.y + int(-2, 2) }))
          out = resolveOverlaps(messy, cols)
        }
        assertValid(out, cols)
        expect(out.map((c) => c.id).sort()).toEqual(
          op === 2 ? input.filter((c) => c.id !== id).map((c) => c.id).sort()
          : op === 3 ? [...input.map((c) => c.id), `c${next - 1}`].sort()
          : input.map((c) => c.id).sort(),
        )
        // Keep roughly eight cards in play.
        ps = out.length < 6 ? appendCard(out, `c${next++}`, { w: int(1, cols), h: int(1, 3) }, cols) : out
        assertValid(ps, cols)
      }
    })
  }
})
