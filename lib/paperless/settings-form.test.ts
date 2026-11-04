import { describe, expect, it } from "vitest"
import { formFromView, toSaveInput, toTestInput, type PaperlessFormState } from "./settings-form"

const base: PaperlessFormState = {
  enabled: true,
  baseUrl: "  https://paperless.local  ",
  apiToken: "",
  clearToken: false,
  access: "EVERYONE",
  schedule: "DAILY",
  time: "03:30",
  weekday: "2",
}

describe("paperless settings form", () => {
  it("seeds the form from the view with an empty token", () => {
    const f = formFromView({ enabled: true, baseUrl: null, access: "ADMIN", schedule: "WEEKLY", time: "04:00", weekday: 5 })
    expect(f).toEqual({ enabled: true, baseUrl: "", apiToken: "", clearToken: false, access: "ADMIN", schedule: "WEEKLY", time: "04:00", weekday: "5" })
  })

  it("trims the URL and maps weekday to a number", () => {
    const i = toSaveInput(base)
    expect(i.baseUrl).toBe("https://paperless.local")
    expect(i.weekday).toBe(2)
    expect(i.time).toBe("03:30")
  })

  it("leaves the token undefined when empty so the stored one is kept", () => {
    expect(toSaveInput(base).apiToken).toBeUndefined()
    expect(toSaveInput(base).clearToken).toBeUndefined()
    expect(toSaveInput({ ...base, apiToken: "   " }).apiToken).toBeUndefined()
  })

  it("sends a typed token trimmed", () => {
    expect(toSaveInput({ ...base, apiToken: " abc " }).apiToken).toBe("abc")
  })

  it("clearToken wins and drops any typed token", () => {
    const i = toSaveInput({ ...base, apiToken: "abc", clearToken: true })
    expect(i.clearToken).toBe(true)
    expect(i.apiToken).toBeUndefined()
  })

  it("falls back to Sunday on a bad weekday", () => {
    expect(toSaveInput({ ...base, weekday: "x" }).weekday).toBe(0)
  })

  it("test input carries only url and token fields", () => {
    expect(toTestInput({ ...base, apiToken: "abc" })).toEqual({ baseUrl: "https://paperless.local", apiToken: "abc" })
    expect(toTestInput({ ...base, clearToken: true })).toEqual({ baseUrl: "https://paperless.local", clearToken: true })
  })
})
