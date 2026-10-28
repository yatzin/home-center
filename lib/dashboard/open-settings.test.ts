import { describe, expect, it } from "vitest"
import { shouldOpenSettings } from "./open-settings"

/** A stand-in element: `closest` matches when the selector list names a tag/attribute it has. */
function target(...marks: string[]) {
  return {
    closest(selector: string) {
      const parts = selector.split(",").map((s) => s.trim())
      return parts.some((p) => marks.includes(p)) ? {} : null
    },
  }
}

describe("shouldOpenSettings", () => {
  it("opens for a double-click on the card body of a card with settings", () => {
    expect(shouldOpenSettings({ target: target(), hasSettings: true, disabled: false })).toBe(true)
  })
  it("does nothing for a card without settings", () => {
    expect(shouldOpenSettings({ target: target(), hasSettings: false, disabled: false })).toBe(false)
  })
  it("does nothing while controls are disabled (Done is finishing)", () => {
    expect(shouldOpenSettings({ target: target(), hasSettings: true, disabled: true })).toBe(false)
  })
  it("does nothing on a control inside the card chrome", () => {
    for (const mark of ["button", "a[href]", "input", "select", "textarea", "[data-gear]", "[data-grip]", "[role='menuitem']"]) {
      expect(shouldOpenSettings({ target: target(mark), hasSettings: true, disabled: false }), mark).toBe(false)
    }
  })
  it("does nothing without a target", () => {
    expect(shouldOpenSettings({ target: null, hasSettings: true, disabled: false })).toBe(false)
  })
})
