import { beforeEach, describe, expect, it } from "vitest"
import path from "path"
import { resolveUploadPath, uploadRoot } from "./upload-path"

describe("resolveUploadPath", () => {
  beforeEach(() => {
    process.env.UPLOAD_DIR = path.resolve("test-uploads")
  })

  it("resolves a record directory inside the root", () => {
    expect(resolveUploadPath("service", "clx123")).toBe(path.join(uploadRoot(), "service", "clx123"))
  })

  it("resolves a file inside a record directory", () => {
    expect(resolveUploadPath("service", "clx123", "a.pdf")).toBe(path.join(uploadRoot(), "service", "clx123", "a.pdf"))
  })

  it("rejects parent traversal out of the root", () => {
    expect(() => resolveUploadPath("service", "../..")).toThrow()
  })

  it("rejects a path that resolves to the root itself", () => {
    expect(() => resolveUploadPath("service", "..")).toThrow()
  })

  it("rejects an empty segment", () => {
    expect(() => resolveUploadPath("service", "")).toThrow()
  })

  it("rejects an absolute segment", () => {
    expect(() => resolveUploadPath(path.resolve("/etc"))).toThrow()
  })

  it("rejects a sibling directory that shares the root's name as a prefix", () => {
    expect(() => resolveUploadPath("..", "test-uploads-evil", "x")).toThrow()
  })
})
