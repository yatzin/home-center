import { describe, expect, it } from "vitest"
import { parseModelTestRequest } from "./request"

const saved = { model: "saved-model", temperature: 0.2, extraBody: '{"a":1}' }
const ids = ["one", "two"]

describe("parseModelTestRequest", () => {
  it("falls back to saved settings for anything not sent", () => {
    expect(parseModelTestRequest({}, saved, ids)).toEqual({
      ok: true,
      value: { model: "saved-model", temperature: 0.2, extraBody: '{"a":1}', caseIds: null, repeat: 1 },
    })
  })

  it("applies overrides; blank temperature and extra JSON mean none", () => {
    const r = parseModelTestRequest({ model: "other", temperature: "", extraBody: "", caseIds: ["two"], repeat: 3 }, saved, ids)
    expect(r).toEqual({ ok: true, value: { model: "other", temperature: null, extraBody: null, caseIds: ["two"], repeat: 3 } })
    expect(parseModelTestRequest({ model: "", temperature: "0.7" }, saved, ids)).toMatchObject({ value: { model: "saved-model", temperature: 0.7 } })
  })

  it("rejects bad values with the settings page's wording", () => {
    expect(parseModelTestRequest({ temperature: "5" }, saved, ids)).toEqual({ ok: false, error: "Temperature must be between 0 and 2." })
    expect(parseModelTestRequest({ extraBody: '{"model":"x"}' }, saved, ids)).toMatchObject({ ok: false })
    expect(parseModelTestRequest({ caseIds: ["nope"] }, saved, ids)).toEqual({ ok: false, error: "Unknown test: nope." })
    expect(parseModelTestRequest({ repeat: 99 }, saved, ids)).toEqual({ ok: false, error: "Invalid request." })
    expect(parseModelTestRequest({}, { ...saved, model: null }, ids)).toMatchObject({ ok: false })
  })

  it("ignores any attempt to change the server or key", () => {
    const r = parseModelTestRequest({ baseUrl: "http://evil", apiKey: "x" }, saved, ids)
    expect(r.ok && Object.keys(r.value)).toEqual(["model", "temperature", "extraBody", "caseIds", "repeat"])
  })
})
