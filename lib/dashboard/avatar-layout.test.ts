import { describe, expect, it } from "vitest"
import {
  AVATAR_GAP,
  AVATAR_SIZE,
  AVATAR_SIZE_COARSE,
  assetLook,
  avatarFit,
  avatarSize,
  initialsOf,
} from "./avatar-layout"

describe("assetLook", () => {
  it.each([
    [1, 1, "single"],
    [1, 2, "column-circles"],
    [1, 6, "column-circles"],
    [1, 8, "column-circles"],
    [2, 1, "row"],
    [3, 1, "row"],
    [12, 1, "row"],
    [2, 2, "column-pills"],
    [2, 6, "column-pills"],
    [2, 8, "column-pills"],
    [3, 2, "rich"],
    [4, 2, "rich"],
    [6, 4, "rich"],
    [12, 8, "rich"],
  ] as const)("%dx%d is %s", (w, h, look) => {
    expect(assetLook({ w, h })).toBe(look)
  })

  it("treats a missing or broken size as the smallest one", () => {
    expect(assetLook({ w: 0, h: 0 })).toBe("single")
    expect(assetLook({ w: Number.NaN, h: 3 })).toBe("column-circles")
    expect(assetLook({ w: 5, h: -1 })).toBe("row")
  })

  it("has no phone mode: it reads the raw grid cells", () => {
    // assetLook takes only the size; a full-width phone card (2 columns) is 2 wide.
    expect(assetLook.length).toBe(1)
    expect(assetLook({ w: 2, h: 4 })).toBe("column-pills")
  })
})

describe("avatarSize", () => {
  it("is the target size when the card has room across", () => {
    expect(avatarSize(AVATAR_SIZE, 200)).toBe(40)
    expect(avatarSize(AVATAR_SIZE_COARSE, 200)).toBe(44)
    expect(AVATAR_GAP).toBe(8)
  })

  it("shrinks to the room across, but never below a floor", () => {
    expect(avatarSize(40, 31.6)).toBe(31)
    expect(avatarSize(40, 5)).toBe(20)
  })

  it("uses the target before the card is measured", () => {
    expect(avatarSize(40, 0)).toBe(40)
    expect(avatarSize(40, Number.NaN)).toBe(40)
  })
})

describe("avatarFit", () => {
  const slot = AVATAR_SIZE + AVATAR_GAP // 48

  it("shows every item when they all fit, with no +N", () => {
    expect(avatarFit({ length: 500, itemCount: 3, total: 3, pills: "never" })).toMatchObject({ shown: 3, more: 0, showMore: false })
  })

  it("fits slots of circle + gap (the last one needs no gap after it)", () => {
    // 4 circles: 4*40 + 3*8 = 184px.
    expect(avatarFit({ length: 184, itemCount: 4, total: 4, pills: "never" })).toMatchObject({ shown: 4, showMore: false })
    expect(avatarFit({ length: 183, itemCount: 4, total: 4, pills: "never" })).toMatchObject({ shown: 2, more: 2, showMore: true })
  })

  it("replaces what does not fit with a final +N chip that counts everything not shown", () => {
    // 5 slots, 9 loaded of 12: 4 avatars + "+8".
    const fit = avatarFit({ length: 5 * slot - AVATAR_GAP, itemCount: 9, total: 12, pills: "never" })
    expect(fit).toMatchObject({ shown: 4, more: 8, showMore: true, slots: 5 })
  })

  it("counts items beyond the loaded limit (\"Show up to N\") even when the loaded ones fit", () => {
    // Room for 10, limit 3 loaded out of 7: 3 avatars + "+4".
    expect(avatarFit({ length: 10 * slot, itemCount: 3, total: 7, pills: "never" })).toMatchObject({ shown: 3, more: 4, showMore: true })
    // Exactly room for the 3 and the chip.
    expect(avatarFit({ length: 4 * slot - AVATAR_GAP, itemCount: 3, total: 7, pills: "never" })).toMatchObject({ shown: 3, more: 4, showMore: true })
    // One short: 2 avatars + "+5".
    expect(avatarFit({ length: 4 * slot - AVATAR_GAP - 1, itemCount: 3, total: 7, pills: "never" })).toMatchObject({ shown: 2, more: 5, showMore: true })
  })

  it("with room for a single slot shows one avatar and no chip", () => {
    expect(avatarFit({ length: 40, itemCount: 5, total: 5, pills: "never" })).toMatchObject({ shown: 1, more: 4, showMore: false, slots: 1 })
  })

  it("tiny, zero and NaN lengths still show one avatar", () => {
    for (const length of [0, 1, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fit = avatarFit({ length, itemCount: 3, total: 3, pills: "auto" })
      expect(fit.shown).toBe(1)
      expect(fit.showMore).toBe(false)
      expect(fit.pills).toBe(false)
    }
  })

  it("no items: nothing shown", () => {
    expect(avatarFit({ length: 500, itemCount: 0, total: 0, pills: "auto" })).toMatchObject({ shown: 0, more: 0, showMore: false })
  })

  it("one item", () => {
    expect(avatarFit({ length: 500, itemCount: 1, total: 1, pills: "never" })).toMatchObject({ shown: 1, more: 0, showMore: false })
  })

  it("many items in a long column", () => {
    const fit = avatarFit({ length: 600, itemCount: 18, total: 40, pills: "always" })
    // floor((600 + 8) / 48) = 12 slots: 11 pills + "+29".
    expect(fit).toMatchObject({ slots: 12, shown: 11, more: 29, showMore: true, pills: true })
  })

  it("a total below the loaded items is treated as the loaded count", () => {
    expect(avatarFit({ length: 500, itemCount: 3, total: 1, pills: "never" })).toMatchObject({ shown: 3, more: 0, showMore: false })
  })

  describe("pills (auto)", () => {
    it("become pills exactly when W / n >= 2 * (circle + gap)", () => {
      // 3 items: 2 * 48 * 3 = 288px.
      expect(avatarFit({ length: 288, itemCount: 3, total: 3, pills: "auto" })).toMatchObject({ shown: 3, pills: true })
      expect(avatarFit({ length: 287.9, itemCount: 3, total: 3, pills: "auto" })).toMatchObject({ shown: 3, pills: false })
    })

    it("count the +N chip as one of the n slots", () => {
      // 2 items + chip = 3 slots in use.
      expect(avatarFit({ length: 288, itemCount: 2, total: 5, pills: "auto" })).toMatchObject({ shown: 2, showMore: true, pills: true })
      expect(avatarFit({ length: 287, itemCount: 2, total: 5, pills: "auto" })).toMatchObject({ pills: false })
    })

    it("split the row evenly between the slots in use", () => {
      const fit = avatarFit({ length: 400, itemCount: 2, total: 2, pills: "auto" })
      expect(fit.pills).toBe(true)
      expect(fit.pillWidth).toBe((400 - AVATAR_GAP) / 2)
    })

    it("one item with room for two slots is a pill", () => {
      expect(avatarFit({ length: 96, itemCount: 1, total: 1, pills: "auto" }).pills).toBe(true)
      expect(avatarFit({ length: 95, itemCount: 1, total: 1, pills: "auto" }).pills).toBe(false)
    })

    it("use the coarse (44px) circle when given", () => {
      // slot 52: 2 * 52 * 2 = 208.
      expect(avatarFit({ length: 208, itemCount: 2, total: 2, circle: 44, pills: "auto" }).pills).toBe(true)
      expect(avatarFit({ length: 207, itemCount: 2, total: 2, circle: 44, pills: "auto" }).pills).toBe(false)
    })
  })

  it("'always' and 'never' force the shape", () => {
    expect(avatarFit({ length: 48, itemCount: 1, total: 1, pills: "always" }).pills).toBe(true)
    expect(avatarFit({ length: 4000, itemCount: 1, total: 1, pills: "never" }).pills).toBe(false)
  })
})

describe("initialsOf", () => {
  it.each([
    ["Mike", "M"],
    ["mike dazzo", "MD"],
    ["Mary Ann Smith", "MA"],
    ["  Lake   House  ", "LH"],
    ["2019 Honda Civic", "2H"],
    ["élise durand", "ÉD"],
    ["(Old) Barn", "OB"],
    ["o'brien", "O"],
    ["🏠 Lake House", "LH"],
    ["👨‍👩‍👧 Family", "F"],
    ["山田 太郎", "山太"],
    ["山田太郎", "山"],
    ["Ölçek", "Ö"],
  ])("%s -> %s", (name, initials) => {
    expect(initialsOf(name)).toBe(initials)
  })

  it("an emoji-only name keeps its first emoji whole", () => {
    expect(initialsOf("🏠")).toBe("🏠")
    expect(initialsOf("👨‍👩‍👧")).toBe("👨‍👩‍👧")
  })

  it("empty or whitespace-only names fall back to ?", () => {
    expect(initialsOf("")).toBe("?")
    expect(initialsOf("   \t\n")).toBe("?")
  })

  it("never grows a letter into two (ß stays ß)", () => {
    expect(initialsOf("ßtraße")).toBe("ß")
  })
})
