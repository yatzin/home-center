import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { zipSync, strToU8 } from "fflate"
import { readFileSync, existsSync } from "fs"
import { parseAssetSegment } from "@/lib/report-server"
import { resolveUploadPath } from "@/lib/upload-path"

// Folder names inside the zip. originalName is client-supplied, so slashes are
// flattened too — a name like "../../x" must not climb out when unzipped.
const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_")
const leaf = (s: string) => s.replace(/[\\/]/g, "_")

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  const assetType = parseAssetSegment(type)
  if (!assetType) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 })
  const isPerson = assetType === "PERSON"

  const [serviceAttachments, warrantyAttachments, conditionAttachments, insuranceAttachments] = await Promise.all([
    prisma.attachment.findMany({
      where: { serviceRecordId: { not: null }, serviceRecord: { assetId: id, assetType } },
      include: { serviceRecord: { select: { title: true, date: true } } },
    }),
    prisma.attachment.findMany({
      where: { warrantyId: { not: null }, warranty: { assetId: id, assetType } },
      include: { warranty: { select: { productName: true } } },
    }),
    isPerson
      ? prisma.attachment.findMany({
          where: { healthCondition: { personId: id } },
          include: { healthCondition: { select: { name: true } } },
        })
      : Promise.resolve([]),
    isPerson
      ? prisma.attachment.findMany({
          where: { insurancePolicy: { members: { some: { id } } } },
          include: { insurancePolicy: { select: { carrier: true } } },
        })
      : Promise.resolve([]),
  ])

  const files: Record<string, Uint8Array> = {}
  function add(zipPath: string, ...segments: string[]) {
    const filePath = resolveUploadPath(...segments)
    if (existsSync(filePath)) files[zipPath] = new Uint8Array(readFileSync(filePath))
  }

  for (const a of serviceAttachments) {
    const date = a.serviceRecord?.date ? new Date(a.serviceRecord.date).toISOString().split("T")[0] : "unknown"
    add(`service/${date}_${safe(a.serviceRecord?.title ?? "service")}/${leaf(a.originalName)}`, "service", a.serviceRecordId!, a.filename)
  }
  for (const a of warrantyAttachments) {
    add(`warranties/${safe(a.warranty?.productName ?? "warranty")}/${leaf(a.originalName)}`, "warranty", a.warrantyId!, a.filename)
  }
  for (const a of conditionAttachments) {
    add(`conditions/${safe(a.healthCondition?.name ?? "condition")}/${leaf(a.originalName)}`, "condition", a.healthConditionId!, a.filename)
  }
  for (const a of insuranceAttachments) {
    add(`insurance/${safe(a.insurancePolicy?.carrier ?? "policy")}/${leaf(a.originalName)}`, "insurance", a.insurancePolicyId!, a.filename)
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
