import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
])

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400")
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const recordId = formData.get("recordId") as string | null
  const recordType = formData.get("recordType") as string | null // SERVICE | WARRANTY | MAINTENANCE

  if (!file || !recordId || !recordType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPG, PNG, or WEBP." }, { status: 400 })
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 400 })
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  const ext = path.extname(file.name).toLowerCase()
  const filename = `${randomUUID()}${ext}`
  const subdir = recordType.toLowerCase()
  const dirPath = path.join(uploadDir, subdir, recordId)
  await mkdir(dirPath, { recursive: true })
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  const attachment = await prisma.attachment.create({
    data: {
      recordType: recordType as "SERVICE" | "WARRANTY" | "MAINTENANCE",
      filename,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: session.user.id,
      serviceRecordId: recordType === "SERVICE" ? recordId : null,
      warrantyId: recordType === "WARRANTY" ? recordId : null,
      maintenanceScheduleId: recordType === "MAINTENANCE" ? recordId : null,
    },
  })

  return NextResponse.json({ attachment })
}
