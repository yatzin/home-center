import { readFile, rename, stat, writeFile } from "fs/promises"
import path from "path"
import sharp from "sharp"

// Lists and cards show a small copy of an asset photo; detail pages and the
// printed report keep the original. The copy sits next to the original as
// "<name>.thumb.webp", is built the first time it is asked for, and goes away
// with the original, so photos uploaded before this existed need no migration.

export const THUMB_MAX_EDGE = 640
const THUMB_QUALITY = 78

// Formats sharp's bundled decoder reads. HEIC is left out on purpose: the
// prebuilt libvips has no HEIC decoder, so those keep being served as-is.
const THUMBABLE = new Set([".jpg", ".jpeg", ".png", ".webp"])

export function isThumbable(filePath: string): boolean {
  return THUMBABLE.has(path.extname(filePath).toLowerCase())
}

export function thumbPathFor(filePath: string): string {
  return `${filePath}.thumb.webp`
}

const inFlight = new Map<string, Promise<Buffer | null>>()

/**
 * The thumbnail bytes for an image file, built and cached on first use.
 * Null when the file can't be thumbnailed (type not supported, or unreadable);
 * the caller then serves the original.
 */
export function getThumbnail(filePath: string): Promise<Buffer | null> {
  if (!isThumbable(filePath)) return Promise.resolve(null)
  const pending = inFlight.get(filePath)
  if (pending) return pending
  const job = buildThumbnail(filePath).finally(() => inFlight.delete(filePath))
  inFlight.set(filePath, job)
  return job
}

async function buildThumbnail(filePath: string): Promise<Buffer | null> {
  const thumbPath = thumbPathFor(filePath)
  try {
    const [original, existing] = await Promise.all([stat(filePath), stat(thumbPath).catch(() => null)])
    if (existing && existing.mtimeMs >= original.mtimeMs) return await readFile(thumbPath)

    const bytes = await sharp(await readFile(filePath))
      .rotate() // honour the EXIF orientation phone photos carry
      .resize({ width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()

    // Write then rename so a request never reads half a file.
    const tmp = `${thumbPath}.${process.pid}.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, thumbPath)
    return bytes
  } catch {
    return null
  }
}
