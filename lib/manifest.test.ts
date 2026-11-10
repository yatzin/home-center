import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import manifest from "@/app/manifest"
import { BRAND_COLORS } from "@/lib/brand-icon-colors"
import { THEMES } from "@/lib/themes"
import { iconThemeId, installIcons } from "@/lib/theme-icons"

describe("web app manifest", () => {
  it("launches standalone from the site root", async () => {
    const m = await manifest()
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
  })

  it("only references icon files that exist", async () => {
    const m = await manifest()
    expect(m.icons?.length).toBeGreaterThan(0)
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(process.cwd(), "public", icon.src)), icon.src).toBe(true)
    }
  })
})

describe("theme icons", () => {
  it("every theme has colours and a full set of icon files", () => {
    for (const t of THEMES) {
      expect(BRAND_COLORS[t.id], t.id).toBeDefined()
      for (const icon of installIcons(t.id)) expect(existsSync(join(process.cwd(), "public", icon.src)), icon.src).toBe(true)
      expect(existsSync(join(process.cwd(), "public", "icons", "theme", `${t.id}-apple.png`)), `${t.id} apple`).toBe(true)
    }
  })

  it("falls back to Spruce for a missing or unknown cookie", () => {
    expect(iconThemeId(undefined)).toBe("light")
    expect(iconThemeId("nope")).toBe("light")
    expect(iconThemeId("terracotta")).toBe("terracotta")
  })
})
