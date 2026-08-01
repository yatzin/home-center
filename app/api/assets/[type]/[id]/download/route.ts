import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { zipSync, strToU8 } from "fflate"
import { readFileSync, existsSync } from "fs"
import path from "path"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  const assetType = type === "properties" ? "PROPERTY" : type === "vehicles" ? "VEHICLE" : null
  if (!assetType) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 })

  const [serviceAttachments, warrantyAttachments] = await Promise.all([
    prisma.attachment.findMany({
      where: { serviceRecordId: { not: null }, serviceRecord: { assetId: id, assetType } },
      include: { serviceRecord: { select: { title: true, date: true } } },
    }),
    prisma.attachment.findMany({
      where: { warrantyId: { not: null }, warranty: { assetId: id, assetType } },
      include: { warranty: { select: { productName: true } } },
    }),
  ])

  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads")

  const files: Record<string, Uint8Array> = {}

  for (const a of serviceAttachments) {
    const date = a.serviceRecord?.date ? new Date(a.serviceRecord.date).toISOString().split("T")[0] : "unknown"
    const title = (a.serviceRecord?.title ?? "service").replace(/[^a-z0-9]/gi, "_")
    const filePath = path.join(uploadDir, "service", a.serviceRecordId!, a.filename)
    if (existsSync(filePath)) {
      files[`service/${date}_${title}/${a.originalName}`] = new Uint8Array(readFileSync(filePath))
    }
  }

  for (const a of warrantyAttachments) {
    const name = (a.warranty?.productName ?? "warranty").replace(/[^a-z0-9]/gi, "_")
    const filePath = path.join(uploadDir, "warranty", a.warrantyId!, a.filename)
    if (existsSync(filePath)) {
      files[`warranties/${name}/${a.originalName}`] = new Uint8Array(readFileSync(filePath))
    }
  }

  if (Object.keys(files).length === 0) {
    files["README.txt"] = strToU8("No attachments found for this asset.")
  }

  const zipped = zipSync(files, { level: 6 })

  return new NextResponse(zipped, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="homecenter-${type}-${id}.zip"`,
    },
  })
}
