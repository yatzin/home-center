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
  productName: z.string().min(1, "Product name is required"),
  purchaseDate: z.string().optional(),
  expirationDate: z.string().optional(),
  vendor: z.string().optional(),
  vendorPhone: z.string().optional(),
  vendorEmail: z.string().optional(),
  notes: z.string().optional(),
})

function clean(v: z.infer<typeof schema>) {
  return {
    assetId: v.assetId,
    assetType: v.assetType,
    productName: v.productName,
    purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
    expirationDate: v.expirationDate ? new Date(v.expirationDate) : null,
    vendor: v.vendor || null,
    vendorPhone: v.vendorPhone || null,
    vendorEmail: v.vendorEmail || null,
    notes: v.notes || null,
  }
}

export async function createWarranty(data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.warranty.create({ data: clean(parsed.data) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/warranties")
  return { success: true }
}

export async function updateWarranty(id: string, data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.warranty.update({ where: { id }, data: clean(parsed.data) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/warranties")
  return { success: true }
}

export async function deleteWarranty(id: string, assetType: string, assetId: string) {
  const session = await auth()
  if (!session) redirect("/login")

  const attachments = await prisma.attachment.findMany({ where: { warrantyId: id } })
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  for (const a of attachments) {
    await rm(path.join(uploadDir, "warranty", id, a.filename), { force: true })
  }
  await rm(path.join(uploadDir, "warranty", id), { recursive: true, force: true })

  await prisma.warranty.delete({ where: { id } })
  revalidatePath(`/assets/${assetType.toLowerCase()}s/${assetId}`)
  revalidatePath("/warranties")
  return { success: true }
}
