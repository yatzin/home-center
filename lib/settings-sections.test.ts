import { describe, expect, it } from "vitest"
import { resolveSection, settingsHref, visibleSections } from "./settings-sections"

describe("settings sections", () => {
  it("shows only personal settings to non-admins", () => {
    expect(visibleSections(false).map((s) => s.id)).toEqual(["notifications", "appearance"])
    expect(visibleSections(true).map((s) => s.id)).toEqual(["notifications", "appearance", "features", "regional", "mail", "assistant", "documents", "paperless", "users", "data"])
  })

  it("opens the requested section, falling back to the first", () => {
    expect(resolveSection("documents", true).id).toBe("documents")
    expect(resolveSection(["users", "mail"], true).id).toBe("users")
    expect(resolveSection(undefined, true).id).toBe("notifications")
    expect(resolveSection("nonsense", true).id).toBe("notifications")
  })

  it("never opens an admin section for a non-admin", () => {
    expect(resolveSection("users", false).id).toBe("notifications")
    expect(resolveSection("appearance", false).id).toBe("appearance")
  })

  it("keeps Paperless-ngx admin only, after documents", () => {
    expect(visibleSections(false).map((s) => s.id)).not.toContain("paperless")
    expect(visibleSections(true).map((s) => s.id)).toContain("paperless")
    expect(resolveSection("paperless", false).id).toBe("notifications")
    expect(resolveSection("paperless", true).label).toBe("Paperless-ngx")
  })

  it("builds links", () => {
    expect(settingsHref("documents")).toBe("/settings?tab=documents")
  })
})
