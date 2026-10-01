import { afterAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { deleteModelFiles, isInstalled, modelDir } from "./files"
import { BUILTIN_MODEL_ID, modelById, type EmbeddingModel } from "./models"

const dir = mkdtempSync(path.join(tmpdir(), "hc-models-"))
const env = { BUILTIN_MODELS_DIR: path.join(dir, "builtin"), MODELS_DIR: path.join(dir, "downloads") }
const model: EmbeddingModel = {
  id: "test", label: "Test", purpose: "", repo: "org/test", revision: "r".repeat(40), dims: 3, pooling: "cls",
  queryPrefix: "", passagePrefix: "", license: "MIT",
  files: [{ path: "config.json", size: 2, sha256: "x".repeat(64) }, { path: "onnx/model_quantized.onnx", size: 3, sha256: "y".repeat(64) }],
}
const put = (m: EmbeddingModel, file: string, data: string) => {
  const p = path.join(modelDir(m, env), file)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, data)
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("model files", () => {
  it("puts the built-in model and downloads in their own roots", () => {
    expect(modelDir(modelById(BUILTIN_MODEL_ID)!, env)).toBe(path.join(env.BUILTIN_MODELS_DIR, "Xenova", "bge-small-en-v1.5"))
    expect(modelDir(model, env)).toBe(path.join(env.MODELS_DIR, "org", "test"))
  })

  it("is installed only when every file is present at its expected size", async () => {
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "config.json", "{}")
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "onnx/model_quantized.onnx", "abcd")
    expect(await isInstalled(model, env)).toBe(false)
    put(model, "onnx/model_quantized.onnx", "abc")
    expect(await isInstalled(model, env)).toBe(true)
  })

  it("deletes a downloaded model and refuses the built-in one", async () => {
    await deleteModelFiles(model, env)
    expect(await isInstalled(model, env)).toBe(false)
    await expect(deleteModelFiles(modelById(BUILTIN_MODEL_ID)!, env)).rejects.toThrow("built-in")
  })
})
