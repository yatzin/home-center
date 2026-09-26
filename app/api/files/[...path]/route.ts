import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { resolveUploadPath } from "@/lib/upload-path"
import { UPLOAD_TYPES } from "@/lib/upload-types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path: segments } = await params
  let filePath: string
  try {
    filePath = resolveUploadPath(...segments)
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const mime = UPLOAD_TYPES[path.extname(filePath).toLowerCase()]
  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime ?? "application/octet-stream",
      // Anything not on the allow-list is handed over as a download, never rendered.
      "Content-Disposition": mime ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
