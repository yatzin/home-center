// Embedding process. Runs one model; the server kills the process to unload
// it. A separate process rather than a worker thread: when a thread ends, the
// native memory onnxruntime used is freed but the allocator keeps it, so the
// server's footprint stayed at its indexing peak. A process gives it all back.
// Never fetches anything: models come from local folders only.
import { env, pipeline } from "@huggingface/transformers"

const config = JSON.parse(process.argv[2])

env.allowRemoteModels = false
env.localModelPath = config.modelsRoot

// The server going away (crash, restart) closes the channel; don't linger.
process.on("disconnect", () => process.exit(0))

const errorName = (e) => (e && typeof e === "object" && "name" in e ? String(e.name) : "Error")

// Low memory mode turns off onnxruntime's arena allocator and memory pattern
// planning: the peak while indexing drops from ~450 MB to ~170 MB, embedding is
// ~1.6x slower.
const session_options = config.lowMemory ? { enableCpuMemArena: false, enableMemPattern: false } : undefined

let extractor
try {
  extractor = await pipeline("feature-extraction", config.repo, { dtype: "q8", session_options })
} catch (e) {
  process.send({ type: "error", name: errorName(e) }, () => process.exit(1))
}
if (extractor) {
  process.send({ type: "ready" })

  process.on("message", async ({ id, texts }) => {
    try {
      const out = await extractor(texts, { pooling: config.pooling, normalize: true })
      process.send({ type: "result", id, vectors: out.tolist() })
    } catch (e) {
      process.send({ type: "result", id, error: errorName(e) })
    }
  })
}
