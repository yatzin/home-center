import { describe, expect, it } from "vitest"
import { clampPanelWidth, DEFAULT_PANEL_WIDTH, readPanelPrefs, writePanelPrefs } from "./panel-prefs"

function memory() {
  const data: Record<string, string> = {}
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) }
}

describe("panel prefs", () => {
  it("round-trips open state and width", () => {
    const s = memory()
    writePanelPrefs(s, { open: true, width: 480 })
    expect(readPanelPrefs(s)).toEqual({ open: true, width: 480 })
  })

  it("falls back to closed and the default width", () => {
    expect(readPanelPrefs(memory())).toEqual({ open: false, width: DEFAULT_PANEL_WIDTH })
    expect(readPanelPrefs(null)).toEqual({ open: false, width: DEFAULT_PANEL_WIDTH })
    const junk = memory()
    junk.setItem("hc.chat.panel", "{nope")
    expect(readPanelPrefs(junk)).toEqual({ open: false, width: DEFAULT_PANEL_WIDTH })
  })

  it("clamps widths to the allowed range", () => {
    expect(clampPanelWidth(100)).toBe(320)
    expect(clampPanelWidth(9000)).toBe(640)
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH)
    const s = memory()
    s.setItem("hc.chat.panel", JSON.stringify({ open: true, width: 5 }))
    expect(readPanelPrefs(s).width).toBe(320)
  })

  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(readPanelPrefs(throwing)).toEqual({ open: false, width: DEFAULT_PANEL_WIDTH })
    expect(() => writePanelPrefs(throwing, { open: true, width: 400 })).not.toThrow()
  })
})
