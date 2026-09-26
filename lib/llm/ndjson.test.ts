import { describe, expect, it } from "vitest"
import { createNdjsonReader } from "./ndjson"

describe("createNdjsonReader", () => {
  it("parses lines split across chunks and skips junk", () => {
    const out: unknown[] = []
    const r = createNdjsonReader((e) => out.push(e))
    r.feed('{"type":"delta","te')
    r.feed('xt":"a"}\n\nnot json\n{"type":"done"')
    r.flush()
    expect(out).toEqual([{ type: "delta", text: "a" }, { type: "done" }])
  })
})
