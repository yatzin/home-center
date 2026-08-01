import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path: segments } = await params
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads")
  const filePath = path.resolve(path.join(uploadDir, ...segments))

  // Prevent path traversal
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
