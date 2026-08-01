"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import path from "path"
import { z } from "zod"

const schema = z.object({
  assetId: z.string().min(1),
  assetType: z.enum(["PROPERTY", "VEHICLE"]),
  date: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  vendor: z.string().optional(),
  cost: z.coerce.number().min(0).optional().or(z.literal("")),
  mileageAtService: z.coerce.number().int().min(0).optional().or(z.literal("")),
})

function clean(v: z.infer<typeof schema>, userId: string) {
  return {
    assetId: v.assetId,
    assetType: v.assetType,
    date: new Date(v.date),
    title: v.title,
    description: v.description || null,
    vendor: v.vendor || null,
    cost: v.cost === "" || v.cost === undefined ? null : Number(v.cost),
    mileageAtService: v.mileageAtService === "" || v.mileageAtService === undefined ? null : Number(v.mileageAtService),
    createdById: userId,
  }
}

export async function createServiceRecord(data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const record = await prisma.serviceRecord.create({ data: clean(parsed.data, session.user.id) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/records")
  return { success: true, id: record.id }
}

export async function updateServiceRecord(id: string, data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.serviceRecord.update({ where: { id }, data: clean(parsed.data, session.user.id) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/records")
  return { success: true }
}

export async function deleteServiceRecord(id: string, assetType: string, assetId: string) {
  const session = await auth()
  if (!session) redirect("/login")

  // Delete attached files from disk before cascading DB delete
  const attachments = await prisma.attachment.findMany({ where: { serviceRecordId: id } })
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  for (const a of attachments) {
    const filePath = path.join(uploadDir, "service", id, a.filename)
    await rm(filePath, { force: true })
  }
  const dirPath = path.join(uploadDir, "service", id)
  await rm(dirPath, { recursive: true, force: true })

  await prisma.serviceRecord.delete({ where: { id } })
  revalidatePath(`/assets/${assetType.toLowerCase()}s/${assetId}`)
  revalidatePath("/records")
  return { success: true }
}
