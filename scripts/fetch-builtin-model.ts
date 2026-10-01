import { BUILTIN_MODEL_ID, modelById } from "../lib/documents/embed/models"
import { builtinRoot, isInstalled } from "../lib/documents/embed/files"
import { downloadModelFiles } from "../lib/documents/embed/download"

// Puts the built-in embedding model in models/builtin/. Run by the Docker
// build (network needed at build time only) and once in local development.

async function main() {
  const m = modelById(BUILTIN_MODEL_ID)!
  if (await isInstalled(m)) {
    console.log(`${m.id} is already in ${builtinRoot()}`)
    return
  }
  let shown = -1
  await downloadModelFiles(m, builtinRoot(), {
    onProgress: ({ received, total }) => {
      const pct = Math.floor((received / total) * 10) * 10
      if (pct !== shown) console.log(`${m.id}: ${(shown = pct)}%`)
    },
  })
  console.log(`${m.id} downloaded to ${builtinRoot()}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
