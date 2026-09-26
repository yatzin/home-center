import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { resolveUploadPath } from "@/lib/upload-path"
import { extensionForFilename, UPLOAD_TYPES } from "@/lib/upload-types"

const RECORD_TYPES = ["SERVICE", "WARRANTY", "MAINTENANCE", "CONDITION", "INSURANCE"] as const
type RecordType = (typeof RECORD_TYPES)[number]

function isRecordType(v: string | null): v is RecordType {
  return v !== null && (RECORD_TYPES as readonly string[]).includes(v)
}

// The record must exist before anything touches the disk: the id becomes a
// directory name, and a made-up id must not be able to create one.
async function recordExists(type: RecordType, id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } } as const
  if (type === "SERVICE") return !!(await prisma.serviceRecord.findUnique(where))
  if (type === "WARRANTY") return !!(await prisma.warranty.findUnique(where))
  if (type === "MAINTENANCE") return !!(await prisma.maintenanceSchedule.findUnique(where))
  if (type === "CONDITION") return !!(await prisma.healthCondition.findUnique(where))
  return !!(await prisma.insurancePolicy.findUnique(where))
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400")
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const recordId = formData.get("recordId") as string | null
  const recordType = formData.get("recordType") as string | null

  if (!file || !recordId || !isRecordType(recordType)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 })
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 400 })
  }
  const ext = extensionForFilename(file.name)
  if (!ext) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPG, PNG, WEBP or HEIC." }, { status: 400 })
  }
  if (!(await recordExists(recordType, recordId))) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 })
  }

  const dirPath = resolveUploadPath(recordType.toLowerCase(), recordId)
  const filename = `${randomUUID()}${ext}`
  await mkdir(dirPath, { recursive: true })
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  const attachment = await prisma.attachment.create({
    data: {
      recordType,
      filename,
      originalName: file.name,
      mimeType: UPLOAD_TYPES[ext],
      sizeBytes: file.size,
      uploadedById: session.user.id,
      serviceRecordId: recordType === "SERVICE" ? recordId : null,
      warrantyId: recordType === "WARRANTY" ? recordId : null,
      maintenanceScheduleId: recordType === "MAINTENANCE" ? recordId : null,
      healthConditionId: recordType === "CONDITION" ? recordId : null,
      insurancePolicyId: recordType === "INSURANCE" ? recordId : null,
    },
  })

  return NextResponse.json({ attachment })
}
