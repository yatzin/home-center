import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtemp, rm, stat, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import sharp from "sharp"
import { getThumbnail, isThumbable, thumbPathFor, THUMB_MAX_EDGE } from "./image-thumb"

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "thumb-"))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function makeImage(name: string, width: number, height: number) {
  const file = path.join(dir, name)
  await sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toFile(file)
  return file
}

describe("image thumbnails", () => {
  it("only handles formats it can decode", () => {
    expect(isThumbable("a.JPG")).toBe(true)
    expect(isThumbable("a.png")).toBe(true)
    expect(isThumbable("a.heic")).toBe(false)
    expect(isThumbable("a.pdf")).toBe(false)
  })

  it("shrinks a large photo to a webp and caches it beside the original", async () => {
    const file = await makeImage("big.jpg", 3000, 2000)
    const bytes = await getThumbnail(file)
    expect(bytes).not.toBeNull()
    const meta = await sharp(bytes!).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.width).toBe(THUMB_MAX_EDGE)
    expect(meta.height).toBeLessThanOrEqual(THUMB_MAX_EDGE)
    expect((await stat(thumbPathFor(file))).isFile()).toBe(true)
  })

  it("does not enlarge a small photo", async () => {
    const file = await makeImage("small.jpg", 100, 80)
    const meta = await sharp((await getThumbnail(file))!).metadata()
    expect(meta.width).toBe(100)
  })

  it("returns null for unsupported or unreadable files", async () => {
    const heic = path.join(dir, "x.heic")
    await writeFile(heic, "not an image")
    expect(await getThumbnail(heic)).toBeNull()
    const broken = path.join(dir, "broken.jpg")
    await writeFile(broken, "not an image")
    expect(await getThumbnail(broken)).toBeNull()
    expect(await getThumbnail(path.join(dir, "missing.png"))).toBeNull()
  })

  it("handles concurrent requests for the same file", async () => {
    const file = await makeImage("race.jpg", 2000, 2000)
    const results = await Promise.all([getThumbnail(file), getThumbnail(file), getThumbnail(file)])
    expect(results.every((r) => r && r.length > 0)).toBe(true)
  })
})
