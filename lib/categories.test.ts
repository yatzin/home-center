import { describe, expect, it } from "vitest"
import {
  DEFAULT_CATEGORIES, equipmentChoices, equipmentLabel, mergeCategories, newCategoryKey, serviceChoices, serviceColor, serviceLabel, serviceOrder,
  type CategoryRow,
} from "./categories"

const row = (over: Partial<CategoryRow> & Pick<CategoryRow, "key">): CategoryRow => ({
  scope: "SERVICE", label: over.key, icon: null, color: null, audience: "ALL", hidden: false, sortOrder: 0, ...over,
})

describe("built-in categories (no rows)", () => {
  it("keeps every former enum key resolvable with its old label", () => {
    expect(serviceLabel("OFFICE_VISIT")).toBe("Office visit")
    expect(serviceLabel("LAB")).toBe("Lab / imaging")
    expect(equipmentLabel("HVAC")).toBe("Heating & Cooling")
    expect(serviceLabel(null)).toBe("Uncategorized")
  })

  it("offers asset categories to assets and medical ones to people, Other to both", () => {
    const asset = serviceChoices(DEFAULT_CATEGORIES, false).map((d) => d.key)
    const person = serviceChoices(DEFAULT_CATEGORIES, true).map((d) => d.key)
    expect(asset).toEqual(["ROUTINE", "REPAIR", "UPGRADE", "INSPECTION", "PARTS", "OTHER"])
    expect(person).toEqual(["OFFICE_VISIT", "PRESCRIPTION", "LAB", "DENTAL", "VISION", "PROCEDURE", "THERAPY", "OTHER"])
  })

  it("orders Other then Uncategorized last, and colours built-ins with their css vars", () => {
    expect(serviceOrder().slice(-2)).toEqual(["OTHER", "UNCATEGORIZED"])
    for (const key of serviceOrder()) expect(serviceColor(key)).toMatch(/^var\(--cost-/)
  })
})

describe("mergeCategories", () => {
  it("renames a built-in without changing its key", () => {
    const defs = mergeCategories([row({ key: "REPAIR", label: "Fix-ups", sortOrder: 20 })])
    expect(serviceLabel("REPAIR", defs)).toBe("Fix-ups")
  })

  it("hides from new records but keeps the current value selectable", () => {
    const defs = mergeCategories([row({ key: "PARTS", label: "Parts", hidden: true, sortOrder: 50 })])
    expect(serviceChoices(defs, false).map((d) => d.key)).not.toContain("PARTS")
    expect(serviceChoices(defs, false, "PARTS").map((d) => d.key)).toContain("PARTS")
    expect(serviceLabel("PARTS", defs)).toBe("Parts")
  })

  it("adds custom categories, with a stable automatic colour, and reorders", () => {
    const defs = mergeCategories([row({ key: "c_abc123", label: "Pool", audience: "ASSET", sortOrder: 5 })])
    expect(serviceOrder(defs)[0]).toBe("c_abc123")
    expect(serviceColor("c_abc123", defs)).toBe(serviceColor("c_abc123", defs))
    expect(serviceColor("c_abc123", defs)).toMatch(/^#/)
    expect(serviceChoices(defs, true).map((d) => d.key)).not.toContain("c_abc123")
  })

  it("keeps scopes apart: OTHER exists in both", () => {
    const defs = mergeCategories([row({ scope: "EQUIPMENT", key: "OTHER", label: "Misc", sortOrder: 80 })])
    expect(equipmentLabel("OTHER", defs)).toBe("Misc")
    expect(serviceLabel("OTHER", defs)).toBe("Other")
    expect(equipmentChoices(defs).length).toBe(8)
  })

  it("labels a deleted category's records readably", () => {
    expect(serviceLabel("c_gone", DEFAULT_CATEGORIES)).toBe("Gone")
  })

  it("shows non-English names as typed, and keeps their key plain ASCII", () => {
    const defs = mergeCategories([
      row({ key: "c_k3j9x2", label: "Jardinería 🌱", sortOrder: 5 }),
      row({ scope: "EQUIPMENT", key: "c_a1b2c3", label: "家電", sortOrder: 5 }),
    ])
    expect(serviceLabel("c_k3j9x2", defs)).toBe("Jardinería 🌱")
    expect(equipmentLabel("c_a1b2c3", defs)).toBe("家電")
    expect(newCategoryKey()).toMatch(/^c_[a-z0-9]+$/)
  })
})
