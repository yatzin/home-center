import path from "path"
import { rm, stat } from "fs/promises"
import type { EmbeddingModel } from "./models"

// Where model files live. The built-in model ships with the app (image:
// /app/models/builtin); downloads go to MODELS_DIR (Docker: /data/models).
// Each model sits under its repo path, the layout transformers.js expects
// when given the root as localModelPath.

type Env = Record<string, string | undefined>

export function builtinRoot(env: Env = process.env): string {
  return path.resolve(env.BUILTIN_MODELS_DIR ?? path.join(process.cwd(), "models", "builtin"))
}

export function downloadsRoot(env: Env = process.env): string {
  return path.resolve(env.MODELS_DIR ?? path.join(process.cwd(), "models", "downloads"))
}

export function modelRoot(m: EmbeddingModel, env: Env = process.env): string {
  return m.builtIn ? builtinRoot(env) : downloadsRoot(env)
}

export function modelDir(m: EmbeddingModel, env: Env = process.env): string {
  return path.join(modelRoot(m, env), ...m.repo.split("/"))
}

/** Every file present at its pinned size. Hashes are checked once, at download. */
export async function isInstalled(m: EmbeddingModel, env: Env = process.env): Promise<boolean> {
  const dir = modelDir(m, env)
  for (const f of m.files) {
    const s = await stat(path.join(dir, ...f.path.split("/"))).catch(() => null)
    if (!s || s.size !== f.size) return false
  }
  return true
}

export async function deleteModelFiles(m: EmbeddingModel, env: Env = process.env): Promise<void> {
  if (m.builtIn) throw new Error("The built-in model can't be deleted")
  const root = downloadsRoot(env)
  const dir = modelDir(m, env)
  if (!dir.startsWith(root + path.sep)) throw new Error("Refusing a path outside the models folder")
  await rm(dir, { recursive: true, force: true })
}
