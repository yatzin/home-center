import { describe, expect, it } from "vitest"
import { DEFAULT_MAX_UPLOAD_BYTES, MULTIPART_SLACK, maxUploadBytes, oversizedBody } from "./upload-limits"

const len = (n: number | null) => new Headers(n === null ? {} : { "content-length": String(n) })

describe("maxUploadBytes", () => {
  it("reads MAX_UPLOAD_BYTES", () => {
    expect(maxUploadBytes("1000")).toBe(1000)
  })

  it("falls back to 25 MiB when unset or not a positive number", () => {
    expect(maxUploadBytes(undefined)).toBe(DEFAULT_MAX_UPLOAD_BYTES)
    expect(maxUploadBytes("lots")).toBe(DEFAULT_MAX_UPLOAD_BYTES)
    expect(maxUploadBytes("0")).toBe(DEFAULT_MAX_UPLOAD_BYTES)
  })
})

describe("oversizedBody", () => {
  it("accepts a body whose file is at the limit, allowing for the form wrapping", () => {
    expect(oversizedBody(len(1000 + MULTIPART_SLACK), 1000)).toBeNull()
  })

  it("refuses a declared body over the limit before anything is read", () => {
    expect(oversizedBody(len(1000 + MULTIPART_SLACK + 1), 1000)?.status).toBe(413)
  })

  it("refuses a body that doesn't declare its length, since it could be any size", () => {
    expect(oversizedBody(len(null), 1000)?.status).toBe(411)
  })

  it("refuses a malformed length", () => {
    expect(oversizedBody(new Headers({ "content-length": "abc" }), 1000)?.status).toBe(411)
  })
})
