import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { Readable } from "stream"
import path from "path"
import { resolveUploadPath } from "@/lib/upload-path"
import { UPLOAD_TYPES } from "@/lib/upload-types"
import { loadFeatures } from "@/lib/features-server"
import { prisma } from "@/lib/prisma"
import { isHealthInsuranceKind } from "@/lib/insurance"
import { getThumbnail } from "@/lib/image-thumb"

// Asset photos are stored under a fresh UUID name, so a given URL never changes
// content and the browser may keep it for good. Everything else can be replaced
// in place, so it revalidates after an hour.
const ASSET_PHOTO_DIRS = new Set(["properties", "vehicles", "equipment", "people"])
const IMMUTABLE = "private, max-age=31536000, immutable"
const REVALIDATE = "private, max-age=3600"

async function isPerson(id: string | undefined): Promise<boolean> {
  return !!id && !!(await prisma.person.findUnique({ where: { id }, select: { id: true } }))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path: segments } = await params
  // People's photos and documents go with the rest of Health.
  if (!(await loadFeatures()).health && (segments[0] === "people" || (segments[0] === "document" && (await isPerson(segments[1]))))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  // A medical, dental or vision card is health data; home, auto and life policy files aren't.
  if (!(await loadFeatures()).health && segments[0] === "insurance") {
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: segments[1] ?? "" }, select: { kind: true } })
    if (policy && isHealthInsuranceKind(policy.kind)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!(await loadFeatures()).rooms && segments[0] === "room") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  let filePath: string
  try {
    filePath = resolveUploadPath(...segments)
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!fileStat.isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const mime = UPLOAD_TYPES[path.extname(filePath).toLowerCase()]
  const isAssetPhoto = segments.length === 3 && ASSET_PHOTO_DIRS.has(segments[0]) && !!mime?.startsWith("image/")
  const cacheControl = isAssetPhoto ? IMMUTABLE : REVALIDATE
  const baseHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheControl,
  }

  // Lists ask for a small copy; anything that can't be shrunk falls through to the original.
  if (isAssetPhoto && request.nextUrl.searchParams.get("size") === "thumb") {
    const thumb = await getThumbnail(filePath)
    if (thumb) {
      const etag = `"${fileStat.mtimeMs.toString(36)}-${thumb.length.toString(36)}-t"`
      if (request.headers.get("if-none-match") === etag) {
        return new NextResponse(null, { status: 304, headers: { ...baseHeaders, ETag: etag } })
      }
      return new NextResponse(new Uint8Array(thumb), {
        headers: { ...baseHeaders, ETag: etag, "Content-Type": "image/webp", "Content-Disposition": "inline" },
      })
    }
  }

  const etag = `"${fileStat.mtimeMs.toString(36)}-${fileStat.size.toString(36)}"`
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...baseHeaders, ETag: etag } })
  }

  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      ...baseHeaders,
      ETag: etag,
      "Content-Type": mime ?? "application/octet-stream",
      "Content-Length": String(fileStat.size),
      // Anything not on the allow-list is handed over as a download, never rendered.
      "Content-Disposition": mime ? "inline" : "attachment",
    },
  })
}
