import { describe, expect, it } from "vitest"
import { defaultLayout, limitsMap, CARD_TYPES } from "./card-types"
import { DEFAULT_FEATURES } from "@/lib/features"
import { LARGE_COLS, PHONE_COLS, type Placement } from "./grid"
import { validateLayout, type DashboardLayout } from "./layout"
import { resolvePhoneLayout } from "./resolve-phone"
import {
  applySaveResult,
  editReducer,
  initialEditState,
  newCardId,
  nextSave,
  snapshotCard,
  type EditAction,
  type EditState,
  type SaveTracker,
} from "./edit-state"

const ALL_ON = { ...DEFAULT_FEATURES, health: true, rooms: true }
const known = limitsMap()

function start(mode: "large" | "phone" = "large", layout: DashboardLayout = defaultLayout(ALL_ON)): EditState {
  return { ...initialEditState(layout, 3, ALL_ON), mode }
}

const valid = (s: EditState) => expect(validateLayout(s.layout, known)).toBeNull()
const placement = (ps: readonly Placement[] | null, id: string) => ps?.find((p) => p.id === id)

describe("initialEditState", () => {
  it("starts clean in large mode", () => {
    const s = initialEditState(defaultLayout(ALL_ON), 5, ALL_ON)
    expect(s).toMatchObject({
      revision: 5,
      mode: "large",
      dirty: false,
      conflict: false,
    })
  })
})

describe("editReducer: large mode", () => {
  it("move changes large and leaves a null phone null", () => {
    const s0 = start()
    const s1 = editReducer(s0, {
      type: "move",
      id: "records",
      to: { x: 0, y: 0 },
    })
    expect(placement(s1.layout.large, "records")).toMatchObject({ x: 0, y: 0 })
    expect(s1.layout.phone).toBeNull()
    expect(s1.dirty).toBe(true)
    valid(s1)
  })

  it("move and resize never touch an existing phone layout", () => {
    const base = defaultLayout(ALL_ON)
    const phone = resolvePhoneLayout(base, ALL_ON)
    const s0 = start("large", { ...base, phone })
    const s1 = editReducer(s0, {
      type: "move",
      id: "records",
      to: { x: 0, y: 0 },
    })
    const s2 = editReducer(s1, {
      type: "resize",
      id: "people",
      size: { w: 6, h: 3 },
    })
    expect(s2.layout.phone).toEqual(phone)
    expect(placement(s2.layout.large, "people")).toMatchObject({ w: 6, h: 3 })
    valid(s2)
  })

  it("resize clamps to the card type's limits", () => {
    const s = editReducer(start(), {
      type: "resize",
      id: "records",
      size: { w: 1, h: 99 },
    })
    expect(placement(s.layout.large, "records")).toMatchObject({ w: 2, h: 6 })
    valid(s)
  })

  it("does not mutate the input state", () => {
    const s0 = start()
    const before = JSON.stringify(s0)
    editReducer(s0, { type: "move", id: "records", to: { x: 0, y: 0 } })
    editReducer(s0, { type: "add", cardType: "records", id: "records-x" })
    editReducer(s0, { type: "remove", id: "people" })
    expect(JSON.stringify(s0)).toBe(before)
  })

  it("a drag preview is computed from the layout at drag start, so pushed cards go back when the card moves on", () => {
    const s0 = start()
    const people = placement(s0.layout.large, "people")!
    // Hovering Records over People pushes People (and whatever it lands on) down.
    const over = editReducer(s0, { type: "move", id: "records", to: { x: people.x, y: people.y } })
    expect(placement(over.layout.large, "people")!.y).toBeGreaterThan(people.y)
    // Moving on to empty rows below everything: every other card is back where it was.
    const bottom = Math.max(...s0.layout.large.map((p) => p.y + p.h))
    const away = editReducer(s0, { type: "move", id: "records", to: { x: 0, y: bottom + 1 } })
    for (const p of s0.layout.large) if (p.id !== "records") expect(placement(away.layout.large, p.id)).toEqual(p)
    // Dropping there keeps the empty row above it (no gravity).
    expect(placement(away.layout.large, "records")!.y).toBe(bottom + 1)
    valid(over)
    valid(away)
  })

  it("moving a card down a row leaves the row empty in the saved layout", () => {
    const s0 = start()
    const records = placement(s0.layout.large, "records")!
    const s1 = editReducer(s0, { type: "move", id: "records", to: { x: records.x, y: records.y + 1 } })
    expect(placement(s1.layout.large, "records")!.y).toBe(records.y + 1)
    valid(s1)
  })
})

describe("editReducer: phone mode", () => {
  it("moveOrder on a null phone materializes it and leaves large unchanged", () => {
    const s0 = start("phone")
    const derived = resolvePhoneLayout(s0.layout, ALL_ON)
    const s1 = editReducer(s0, {
      type: "moveOrder",
      id: "vehicles",
      delta: -1,
    })
    expect(s1.layout.large).toEqual(s0.layout.large)
    expect(s1.layout.phone).not.toBeNull()
    // Vehicles swaps places with Properties (the greeting stays first).
    expect(placement(s1.layout.phone, "vehicles")).toMatchObject({ y: placement(derived, "properties")!.y })
    expect(placement(s1.layout.phone, "properties")!).toMatchObject({
      y: placement(derived, "vehicles")!.y,
    })
    expect(s1.dirty).toBe(true)
    valid(s1)
  })

  it("a no-op phone edit (first card up) does not materialize or dirty", () => {
    const s0 = start("phone")
    const s1 = editReducer(s0, {
      type: "moveOrder",
      id: "greeting",
      delta: -1,
    })
    expect(s1).toBe(s0)
  })

  it("resize in phone mode clamps to PHONE_COLS and the type's limits", () => {
    const s = editReducer(start("phone"), {
      type: "resize",
      id: "intake",
      size: { w: 12, h: 1 },
    })
    expect(placement(s.layout.phone, "intake")).toMatchObject({
      w: PHONE_COLS,
      h: 2,
    })
    expect(s.layout.large).toEqual(start().layout.large)
    valid(s)
  })

  it("move in phone mode does not touch large", () => {
    const s0 = start("phone")
    const s1 = editReducer(s0, {
      type: "move",
      id: "intake",
      to: { x: 0, y: 0 },
    })
    expect(placement(s1.layout.phone, "intake")).toMatchObject({ x: 0, y: 0 })
    expect(s1.layout.large).toEqual(s0.layout.large)
    valid(s1)
  })
})

describe("editReducer: phone moveOrder skips hidden cards", () => {
  const HEALTH_OFF = { ...ALL_ON, health: false }

  it("stored phone [A, H, B]: moving B up puts it before A", () => {
    const layout: DashboardLayout = {
      format: 1,
      cards: [
        { id: "records", type: "records", config: {} },
        { id: "people", type: "people", config: {} },
        { id: "equipment", type: "equipment", config: {} },
      ],
      large: [
        { id: "records", x: 0, y: 0, w: 2, h: 1 },
        { id: "people", x: 2, y: 0, w: 4, h: 2 },
        { id: "equipment", x: 6, y: 0, w: 4, h: 2 },
      ],
      phone: [
        { id: "records", x: 0, y: 0, w: 2, h: 1 },
        { id: "people", x: 0, y: 1, w: 2, h: 2 },
        { id: "equipment", x: 0, y: 3, w: 2, h: 2 },
      ],
    }
    const s0 = {
      ...initialEditState(layout, 1, HEALTH_OFF),
      mode: "phone" as const,
    }
    const s1 = editReducer(s0, {
      type: "moveOrder",
      id: "equipment",
      delta: -1,
    })
    // Equipment takes Records' slot and pushes it down; the hidden People card in the way goes below them.
    expect(placement(s1.layout.phone, "equipment")!.y).toBe(0)
    expect(placement(s1.layout.phone, "records")!.y).toBe(2)
    expect(placement(s1.layout.phone, "people")!.y).toBe(3)
    expect(s1.layout.large).toEqual(layout.large)
    valid(s1)
  })

  it("derived phone with a feature off: the last visible card moving down is a no-op", () => {
    const s0 = {
      ...initialEditState(defaultLayout(ALL_ON), 1, HEALTH_OFF),
      mode: "phone" as const,
    }
    // The derived order is row by row: Expiring Warranties (the lowest row) is the last visible card.
    expect(editReducer(s0, { type: "moveOrder", id: "expiring-warranties", delta: 1 })).toBe(s0)
    const s1 = editReducer(s0, {
      type: "moveOrder",
      id: "expiring-warranties",
      delta: -1,
    })
    expect(s1.layout.phone).not.toBeNull()
    valid(s1)
  })
})

describe("editReducer: add / remove / config", () => {
  it("add appends to both layouts with default size and config, creating phone if null", () => {
    const s0 = start()
    const s1 = editReducer(s0, {
      type: "add",
      cardType: "spending-breakdown",
      id: "spending-breakdown-1",
    })
    const card = s1.layout.cards.find((c) => c.id === "spending-breakdown-1")
    expect(card).toEqual({
      id: "spending-breakdown-1",
      type: "spending-breakdown",
      config: { range: "ytd" },
    })
    expect(placement(s1.layout.large, "spending-breakdown-1")).toMatchObject({
      w: 4,
      h: 3,
    })
    const phone = s1.layout.phone!
    const p = placement(phone, "spending-breakdown-1")!
    expect(p).toMatchObject({ x: 0, w: 2, h: 3 })
    // At the end of the phone layout.
    expect(Math.max(...phone.map((q) => q.y + q.h))).toBe(p.y + p.h)
    // The rest of phone is the derived layout.
    expect(phone.filter((q) => q.id !== p.id)).toEqual(resolvePhoneLayout(s0.layout, ALL_ON))
    expect(s1.dirty).toBe(true)
    valid(s1)
  })

  it("add with a duplicate id or unknown type is a no-op", () => {
    const s0 = start()
    expect(editReducer(s0, { type: "add", cardType: "records", id: "records" })).toBe(s0)
    expect(editReducer(s0, { type: "add", cardType: "nope", id: "nope-1" })).toBe(s0)
  })

  it("remove removes from both layouts", () => {
    const base = defaultLayout(ALL_ON)
    const s0 = start("large", {
      ...base,
      phone: resolvePhoneLayout(base, ALL_ON),
    })
    const s1 = editReducer(s0, { type: "remove", id: "people" })
    expect(s1.layout.cards.some((c) => c.id === "people")).toBe(false)
    expect(placement(s1.layout.large, "people")).toBeUndefined()
    expect(placement(s1.layout.phone, "people")).toBeUndefined()
    valid(s1)
  })

  it("remove in large mode keeps a null phone null", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    expect(s1.layout.phone).toBeNull()
    valid(s1)
  })

  it("config changes keep placements and validate against the schema", () => {
    const s0 = start()
    const s1 = editReducer(s0, {
      type: "config",
      id: "reminders",
      config: { windowDays: 14, limit: 3 },
    })
    expect(s1.layout.cards.find((c) => c.id === "reminders")!.config).toEqual({
      windowDays: 14,
      limit: 3,
    })
    expect(s1.layout.large).toBe(s0.layout.large)
    expect(s1.layout.phone).toBe(s0.layout.phone)
    expect(s1.dirty).toBe(true)
    expect(
      editReducer(s0, {
        type: "config",
        id: "reminders",
        config: { windowDays: -1 },
      }),
    ).toBe(s0)
    expect(editReducer(s0, { type: "config", id: "missing", config: {} })).toBe(s0)
  })

  it("unknown ids are no-ops", () => {
    const s0 = start()
    for (const a of [
      { type: "move", id: "x", to: { x: 0, y: 0 } },
      { type: "resize", id: "x", size: { w: 3, h: 3 } },
      { type: "moveOrder", id: "x", delta: 1 },
      { type: "remove", id: "x" },
    ] as EditAction[]) {
      expect(editReducer(s0, a)).toBe(s0)
      expect(editReducer({ ...s0, mode: "phone" }, a)).toEqual({
        ...s0,
        mode: "phone",
      })
    }
  })
})

describe("editReducer: snapshot and restore", () => {
  it("restoring a removed card puts it back in both layouts", () => {
    const base = defaultLayout(ALL_ON)
    const s0 = start("large", {
      ...base,
      phone: resolvePhoneLayout(base, ALL_ON),
    })
    const snap = snapshotCard(s0, "records")!
    expect(snap.card.id).toBe("records")
    expect(snap.large).toEqual(placement(s0.layout.large, "records"))
    expect(snap.phone).toEqual(placement(s0.layout.phone, "records"))
    const s1 = editReducer(s0, { type: "remove", id: "records" })
    const s2 = editReducer(s1, { type: "restore", snapshot: snap })
    expect(s2.layout.cards.map((c) => c.id).sort()).toEqual(s0.layout.cards.map((c) => c.id).sort())
    expect(s2.layout.large.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      s0.layout.large.slice().sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(placement(s2.layout.phone, "records")).toMatchObject({
      w: snap.phone!.w,
      h: snap.phone!.h,
    })
    valid(s2)
  })

  it("snapshot of an unknown id is null; restoring an id that exists is a no-op", () => {
    const s0 = start()
    expect(snapshotCard(s0, "nope")).toBeNull()
    const snap = snapshotCard(s0, "records")!
    expect(editReducer(s0, { type: "restore", snapshot: snap })).toBe(s0)
  })
})

describe("editReducer: save lifecycle", () => {
  it("saved clears dirty and updates the revision", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const s2 = editReducer(s1, {
      type: "saved",
      revision: 4,
      layout: s1.layout,
    })
    expect(s2).toMatchObject({ dirty: false, revision: 4 })
  })

  it("saved for an older layout keeps dirty (a change arrived while saving)", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const s2 = editReducer(s1, { type: "remove", id: "equipment" })
    const s3 = editReducer(s2, {
      type: "saved",
      revision: 4,
      layout: s1.layout,
    })
    expect(s3).toMatchObject({ dirty: true, revision: 4 })
  })

  it("saved never moves the revision backwards", () => {
    const s1 = editReducer({ ...start(), revision: 7 }, { type: "saved", revision: 4 })
    expect(s1.revision).toBe(7)
  })

  it("conflict sets the flag; replace clears it and takes the new layout", () => {
    const s1 = editReducer(editReducer(start(), { type: "remove", id: "people" }), { type: "conflict" })
    expect(s1.conflict).toBe(true)
    const fresh = defaultLayout(ALL_ON)
    const s2 = editReducer(s1, { type: "replace", layout: fresh, revision: 9 })
    expect(s2).toMatchObject({
      layout: fresh,
      revision: 9,
      dirty: false,
      conflict: false,
    })
  })

  it("mode switches the layout edits apply to", () => {
    const s = editReducer(start(), { type: "mode", mode: "phone" })
    expect(s.mode).toBe("phone")
    expect(s.dirty).toBe(false)
  })
})

describe("newCardId", () => {
  it("prefixes the type and avoids existing ids", () => {
    const id = newCardId("records", ["records"], () => 0.5)
    expect(id.startsWith("records-")).toBe(true)
    expect(id).not.toBe("records")
  })

  it("falls back to a counter when the random source keeps colliding", () => {
    const first = newCardId("records", [], () => 0.5)
    const second = newCardId("records", [first], () => 0.5)
    expect(second).not.toBe(first)
    expect(second.startsWith("records-")).toBe(true)
  })
})

describe("autosave decisions", () => {
  const tracker = (revision = 3): SaveTracker => ({
    revision,
    savedLayout: null,
    failedLayout: null,
  })

  it("nothing to save when clean or in conflict", () => {
    const s0 = start()
    expect(nextSave(s0, tracker())).toBeNull()
    const s1 = editReducer(s0, { type: "remove", id: "people" })
    expect(nextSave({ ...s1, conflict: true }, tracker())).toEqual(null)
    expect(nextSave(s1, tracker())).toEqual({
      layout: s1.layout,
      baseRevision: 3,
    })
  })

  it("success advances the tracker and yields a saved action", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const r = applySaveResult(tracker(), s1.layout, {
      success: true,
      revision: 4,
    })
    expect(r.action).toEqual({ type: "saved", revision: 4, layout: s1.layout })
    expect(r.error).toBeNull()
    // Before React re-renders, the same (still dirty) state is not saved twice.
    expect(nextSave(s1, r.tracker)).toBeNull()
    // A newer change saves against the new revision.
    const s2 = editReducer(s1, { type: "remove", id: "equipment" })
    expect(nextSave(s2, r.tracker)).toEqual({
      layout: s2.layout,
      baseRevision: 4,
    })
  })

  it("conflict yields a conflict action", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const r = applySaveResult(tracker(), s1.layout, {
      error: "changed",
      conflict: true,
    })
    expect(r.action).toEqual({ type: "conflict" })
    // Before React re-renders the conflict flag, the same layout is not re-sent.
    expect(nextSave(s1, r.tracker)).toBeNull()
  })

  it("other errors surface, are not retried for the same layout, and retry on the next change", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const r = applySaveResult(tracker(), s1.layout, { error: "boom" })
    expect(r.action).toBeNull()
    expect(r.error).toBe("boom")
    expect(nextSave(s1, r.tracker)).toBeNull()
    // An explicit flush (Done) retries it.
    expect(nextSave(s1, r.tracker, true)).toEqual({
      layout: s1.layout,
      baseRevision: 3,
    })
    const s2 = editReducer(s1, { type: "remove", id: "equipment" })
    expect(nextSave(s2, r.tracker)).toEqual({
      layout: s2.layout,
      baseRevision: 3,
    })
  })

  it("a replaced state with a newer revision saves against it", () => {
    const s1 = editReducer(start(), { type: "remove", id: "people" })
    const s2 = editReducer(editReducer(s1, { type: "replace", layout: s1.layout, revision: 10 }), {
      type: "remove",
      id: "equipment",
    })
    expect(nextSave(s2, tracker(4))!.baseRevision).toBe(10)
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

describe("editReducer: randomized", () => {
  const storedPhoneStart = (): EditState => {
    const features = { ...ALL_ON, health: false, rooms: false }
    const base = defaultLayout(ALL_ON)
    const withRooms = editReducer(start("large", base), {
      type: "add",
      cardType: "rooms",
      id: "rooms",
    }).layout
    return {
      ...initialEditState({ ...withRooms, phone: resolvePhoneLayout(withRooms, features) }, 3, features),
      mode: "phone",
    }
  }
  for (const [seed, init] of [
    [1, () => start()],
    [42, () => start()],
    [2026, () => start()],
    [7, storedPhoneStart],
    [99, storedPhoneStart],
  ] as const) {
    it(`every reachable state is valid over 300 actions (seed ${seed})`, () => {
      const rand = mulberry32(seed)
      const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
      let s = init()
      const seen: DashboardLayout[] = [s.layout]
      const snaps = [] as NonNullable<ReturnType<typeof snapshotCard>>[]
      for (let i = 0; i < 300; i++) {
        const ids = s.layout.cards.map((c) => c.id)
        const id = ids.length && rand() < 0.95 ? pick(ids) : "ghost"
        const cols = s.mode === "large" ? LARGE_COLS : PHONE_COLS
        const roll = int(0, 11)
        let a: EditAction
        if (roll === 0) a = { type: "mode", mode: s.mode === "large" ? "phone" : "large" }
        else if (roll === 1)
          a = {
            type: "move",
            id,
            to: { x: int(-2, cols + 2), y: int(-2, 30) },
          }
        else if (roll === 2) a = { type: "resize", id, size: { w: int(0, 14), h: int(0, 10) } }
        else if (roll === 3) a = { type: "moveOrder", id, delta: rand() < 0.5 ? -1 : 1 }
        else if (roll === 4) {
          const t = rand() < 0.95 ? pick(CARD_TYPES).id : "unknown"
          a = { type: "add", cardType: t, id: newCardId(t, ids, rand) }
        } else if (roll === 5) {
          const snap = snapshotCard(s, id)
          if (snap) snaps.push(snap)
          a = { type: "remove", id }
        } else if (roll === 6 && snaps.length) a = { type: "restore", snapshot: snaps.pop()! }
        else if (roll === 7) a = { type: "config", id, config: { limit: int(0, 60) } }
        else if (roll === 8) a = { type: "saved", revision: s.revision + 1, layout: s.layout }
        else if (roll === 9) a = { type: "move", id, to: { x: NaN, y: int(0, 5) } }
        else if (roll === 10) a = { type: "conflict" }
        else
          a = {
            type: "replace",
            layout: pick(seen),
            revision: s.revision + int(0, 2),
          }
        const prev = s
        s = editReducer(s, a)
        expect(validateLayout(s.layout, known), `step ${i}: ${JSON.stringify(a)}`).toBeNull()
        expect(s.revision).toBeGreaterThanOrEqual(a.type === "replace" ? 0 : prev.revision)
        if (s.layout !== prev.layout) seen.push(s.layout)
        if (a.type === "move" || a.type === "resize" || a.type === "moveOrder") {
          // Edits only touch the current mode's layout (phone may be materialized from null).
          if (prev.mode === "large") expect(s.layout.phone).toEqual(prev.layout.phone)
          else expect(s.layout.large).toEqual(prev.layout.large)
        }
      }
    })
  }
})
