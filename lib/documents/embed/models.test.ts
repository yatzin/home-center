import { describe, expect, it } from "vitest"
import { BUILTIN_MODEL_ID, EMBEDDING_MODELS, modelById, modelKey, modelSize } from "./models"

describe("embedding model registry", () => {
  it("has unique ids and exactly one built-in model, the default", () => {
    const ids = EMBEDDING_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const builtIn = EMBEDDING_MODELS.filter((m) => m.builtIn)
    expect(builtIn.map((m) => m.id)).toEqual([BUILTIN_MODEL_ID])
  })

  it.each(EMBEDDING_MODELS.map((m) => [m.id, m] as const))("pins everything needed to download and run %s", (_id, m) => {
    expect(m.revision).toMatch(/^[0-9a-f]{40}$/)
    expect([384, 768, 1024]).toContain(m.dims)
    expect(["cls", "mean"]).toContain(m.pooling)
    const paths = m.files.map((f) => f.path)
    for (const needed of ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]) {
      expect(paths).toContain(needed)
    }
    for (const f of m.files) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(f.size).toBeGreaterThan(0)
      expect(f.path).not.toMatch(/\.\.|^\//)
    }
    expect(m.repo).toMatch(/^[\w.-]+\/[\w.-]+$/)
  })

  it("looks models up and describes them", () => {
    const m = modelById(BUILTIN_MODEL_ID)!
    expect(modelKey(m)).toBe(`bge-small-en-v1.5@${m.revision}`)
    expect(modelSize(m)).toBe(m.files.reduce((n, f) => n + f.size, 0))
    expect(modelById("not-a-model")).toBeNull()
  })
})
