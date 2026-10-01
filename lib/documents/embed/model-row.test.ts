import { describe, expect, it } from "vitest"
import { modelRowState } from "./model-row"

const row = (o: { active?: boolean; installed?: boolean; builtIn?: boolean }) => ({ active: false, installed: true, builtIn: false, ...o })

describe("modelRowState", () => {
  it("says when the model in use has no files, so it can be downloaded again", () => {
    expect(modelRowState(row({ active: true, installed: false }), false)).toBe("in-use-missing")
    expect(modelRowState(row({ active: true, installed: false, builtIn: true }), false)).toBe("builtin-missing")
  })

  it("never offers a download for a missing built-in model", () => {
    expect(modelRowState(row({ installed: false, builtIn: true }), false)).toBe("builtin-missing")
  })

  it("covers the ordinary states", () => {
    expect(modelRowState(row({ active: true }), false)).toBe("in-use")
    expect(modelRowState(row({}), false)).toBe("installed")
    expect(modelRowState(row({ installed: false }), false)).toBe("available")
    expect(modelRowState(row({ active: true, installed: false }), true)).toBe("downloading")
  })
})
