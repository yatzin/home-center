import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { resolveUploadPath } from "@/lib/upload-path"
import { maxUploadBytes, oversizedBody } from "@/lib/upload-limits"
import { extensionForFilename, UPLOAD_TYPES } from "@/lib/upload-types"
import { enqueueDocument } from "@/lib/documents/indexer-server"
import { isRecordType, resolveAttachmentRecord, attachmentRecordFields } from "@/lib/attachments/create-server"
import { loadDocumentSettings } from "@/lib/documents/settings"
import { processInboxItem } from "@/lib/capture-server"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const maxBytes = maxUploadBytes()
  const tooBig = oversizedBody(request.headers, maxBytes)
  if (tooBig) return NextResponse.json({ error: tooBig.error }, { status: tooBig.status })
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
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 })
  }
  const resolved = await resolveAttachmentRecord(recordType, recordId)
  if (!resolved.found) return NextResponse.json({ error: "Record not found" }, { status: 404 })

  const dirPath = resolveUploadPath(recordType.toLowerCase(), recordId)
  const filename = `${randomUUID()}${ext}`
  await mkdir(dirPath, { recursive: true })
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  const attachment = await prisma.attachment.create({
    data: {
      ...attachmentRecordFields(recordType, recordId, resolved.assetType),
      filename,
      originalName: file.name,
      mimeType: UPLOAD_TYPES[ext],
      sizeBytes: file.size,
      uploadedById: session.user.id,
      // Every upload is indexed in the background; the response doesn't wait.
      text: { create: {} },
    },
  })

  enqueueDocument(attachment.id)
  // With indexing off nothing will read the file, so the item is settled now
  // (ready to file by hand) instead of waiting forever.
  if (recordType === "INBOX" && !(await loadDocumentSettings()).indexingEnabled) await processInboxItem(recordId)
  return NextResponse.json({ attachment })
}
