import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir, rm } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])

async function findAsset(type: string, id: string) {
  if (type === "properties") return { subdir: "properties", record: await prisma.property.findUnique({ where: { id } }) } as const
  if (type === "vehicles") return { subdir: "vehicles", record: await prisma.vehicle.findUnique({ where: { id } }) } as const
  return null
}

async function setImage(type: string, id: string, filename: string | null) {
  if (type === "properties") return prisma.property.update({ where: { id }, data: { imageFilename: filename } })
  return prisma.vehicle.update({ where: { id }, data: { imageFilename: filename } })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  if (type !== "properties" && type !== "vehicles") {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 })
  }

  const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400")
  const formData = await request.formData()
  const file = formData.get("file") as File | null

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use JPG, PNG, or WEBP." }, { status: 400 })
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 400 })
  }

  const asset = await findAsset(type, id)
  if (!asset?.record) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  const dirPath = path.join(uploadDir, asset.subdir, id)
  await mkdir(dirPath, { recursive: true })

  const ext = path.extname(file.name).toLowerCase()
  const filename = `${randomUUID()}${ext}`
  await writeFile(path.join(dirPath, filename), Buffer.from(await file.arrayBuffer()))

  if (asset.record.imageFilename) {
    await rm(path.join(dirPath, asset.record.imageFilename), { force: true })
  }

  await setImage(type, id, filename)

  return NextResponse.json({ imageFilename: filename })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  if (type !== "properties" && type !== "vehicles") {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 })
  }

  const asset = await findAsset(type, id)
  if (!asset?.record) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (asset.record.imageFilename) {
    const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
    await rm(path.join(uploadDir, asset.subdir, id, asset.record.imageFilename), { force: true })
  }

  await setImage(type, id, null)

  return NextResponse.json({ success: true })
}
