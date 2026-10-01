// Embedding worker. Runs one model; the main thread terminates the worker to
// unload it, which returns its memory to the OS (dispose() in the main thread
// did not). Never fetches anything: models come from local folders only.
import { parentPort, workerData } from "node:worker_threads"
import { env, pipeline } from "@huggingface/transformers"

env.allowRemoteModels = false
env.localModelPath = workerData.modelsRoot

const errorName = (e) => (e && typeof e === "object" && "name" in e ? String(e.name) : "Error")

let extractor
try {
  extractor = await pipeline("feature-extraction", workerData.repo, { dtype: "q8" })
} catch (e) {
  parentPort.postMessage({ type: "error", name: errorName(e) })
  process.exit(1)
}
parentPort.postMessage({ type: "ready" })

parentPort.on("message", async ({ id, texts }) => {
  try {
    const out = await extractor(texts, { pooling: workerData.pooling, normalize: true })
    parentPort.postMessage({ type: "result", id, vectors: out.tolist() })
  } catch (e) {
    parentPort.postMessage({ type: "result", id, error: errorName(e) })
  }
})
