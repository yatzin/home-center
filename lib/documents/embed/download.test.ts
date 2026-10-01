import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHash } from "crypto"
import { createServer, type Server } from "http"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import type { AddressInfo } from "net"
import { DownloadError, downloadModelFiles, type DownloadProgress } from "./download"
import type { EmbeddingModel } from "./models"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const files: Record<string, string> = { "config.json": '{"a":1}', "onnx/model_quantized.onnx": "x".repeat(5000) }
let served: Record<string, string> = files
let server: Server
let baseUrl: string
const roots: string[] = []

const model = (): EmbeddingModel => ({
  id: "t", label: "T", purpose: "", repo: "org/t", revision: "a".repeat(40), dims: 3, pooling: "cls", queryPrefix: "",
  passagePrefix: "", license: "MIT",
  files: Object.entries(files).map(([p, c]) => ({ path: p, size: c.length, sha256: sha(c) })),
})

beforeAll(async () => {
  server = createServer((req, res) => {
    const prefix = `/org/t/resolve/${"a".repeat(40)}/`
    const rel = req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : ""
    if (rel === "drop") return req.socket.destroy()
    if (!(rel in served)) {
      res.statusCode = 404
      return res.end()
    }
    res.end(served[rel])
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hc-dl-"))
  roots.push(dir)
  return dir
}
const leftovers = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".part")) : []

describe("downloadModelFiles", () => {
  it("downloads every file, reports progress and leaves no partial files", async () => {
    const r = fresh()
    const progress: DownloadProgress[] = []
    await downloadModelFiles(model(), r, { baseUrl, onProgress: (p) => progress.push(p) })
    expect(readFileSync(path.join(r, "org", "t", "onnx", "model_quantized.onnx"), "utf8")).toBe(files["onnx/model_quantized.onnx"])
    expect(progress.at(-1)).toEqual({ received: 5007, total: 5007 })
    expect(leftovers(r)).toEqual([])
  })

  it("rejects bytes that don't match the pinned checksum and removes them", async () => {
    const r = fresh()
    served = { ...files, "onnx/model_quantized.onnx": "y".repeat(5000) }
    await expect(downloadModelFiles(model(), r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed checksum"))
    expect(existsSync(path.join(r, "org", "t", "onnx", "model_quantized.onnx"))).toBe(false)
    expect(leftovers(r)).toEqual([])
    served = files
  })

  it("reports an HTTP error", async () => {
    const r = fresh()
    served = { "config.json": files["config.json"] }
    await expect(downloadModelFiles(model(), r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed (HTTP 404)"))
    served = files
  })

  it("reports a dropped connection as a plain failure", async () => {
    const r = fresh()
    const m = model()
    m.files = [{ path: "drop", size: 1, sha256: sha("z") }]
    await expect(downloadModelFiles(m, r, { baseUrl })).rejects.toEqual(new DownloadError("Download failed"))
    expect(leftovers(r)).toEqual([])
  })
})

afterAll(() => {
  // Only the folders this file created; best-effort, as in the other tests.
  for (const dir of roots) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
})
