import { afterAll, describe, expect, it } from "vitest"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { createEmbedder, EmbedderError } from "./embedder"
import { builtinRoot, isInstalled } from "./files"
import { BUILTIN_MODEL_ID, modelById } from "./models"

const workerPath = path.join(process.cwd(), "workers", "embed-worker.mjs")
const builtin = modelById(BUILTIN_MODEL_ID)!
const haveBuiltin = await isInstalled(builtin)
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

describe("embedder", () => {
  it("fails cleanly when the model files are missing", async () => {
    const e = createEmbedder({ model: builtin, modelsRoot: mkdtempSync(path.join(tmpdir(), "hc-nomodel-")), workerPath, idleMs: 0 })
    await expect(e.embedQuery("anything")).rejects.toBeInstanceOf(EmbedderError)
    expect(e.loaded()).toBe(false)
  }, 60_000)

  describe.skipIf(!haveBuiltin)("with the built-in model (run npm run models:fetch-builtin)", () => {
    const e = createEmbedder({ model: builtin, modelsRoot: builtinRoot(), workerPath, idleMs: 60_000 })
    afterAll(() => e.unload())

    it("embeds passages to unit vectors of the model's size", async () => {
      const [v1, v2] = await e.embedPassages(["Replace the furnace filter every 90 days.", "The deductible is $500 per claim."])
      expect(v1).toHaveLength(384)
      expect(dot(v1, v1)).toBeCloseTo(1, 3)
      expect(dot(v1, v2)).toBeLessThan(0.95)
    }, 60_000)

    it("finds the passage that means the same as the question", async () => {
      const q = await e.embedQuery("how often do I swap the furnace filter?")
      const [filter, deductible] = await e.embedPassages(["Replace the furnace filter every 90 days.", "The deductible is $500 per claim."])
      expect(dot(q, filter)).toBeGreaterThan(dot(q, deductible))
    }, 60_000)

    it("unloads on request and loads again when needed", async () => {
      await e.embedQuery("warm up")
      expect(e.loaded()).toBe(true)
      await e.unload()
      await new Promise((r) => setTimeout(r, 200))
      expect(e.loaded()).toBe(false)
      expect(await e.embedQuery("again")).toHaveLength(384)
    }, 60_000)
  })
})
