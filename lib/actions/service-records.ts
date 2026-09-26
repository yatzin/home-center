"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ASSET_TYPES, assetHref } from "@/lib/assets"
import { SERVICE_CATEGORY_VALUES } from "@/lib/costs"
import type { AssetType } from "@/app/generated/prisma/client"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { resolveUploadPath } from "@/lib/upload-path"
import { z } from "zod"

const schema = z.object({
  assetId: z.string().min(1),
  assetType: z.enum(ASSET_TYPES),
  date: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  vendor: z.string().optional(),
  cost: z.coerce.number().optional().or(z.literal("")),
  category: z.enum(SERVICE_CATEGORY_VALUES).optional().or(z.literal("")),
  mileageAtService: z.coerce.number().int().min(0).optional().or(z.literal("")),
  providerId: z.string().optional(),
  conditionId: z.string().optional(),
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
    category: v.category === "" || v.category === undefined ? null : v.category,
    mileageAtService: v.mileageAtService === "" || v.mileageAtService === undefined ? null : Number(v.mileageAtService),
    providerId: v.providerId || null,
    conditionId: v.conditionId || null,
    createdById: userId,
  }
}

// A visit linked to a provider but with no facility typed still has a payee,
// so the cost reports' vendor ranking works for medical spend too.
async function withProviderVendor<T extends { providerId: string | null; vendor: string | null }>(data: T): Promise<T> {
  if (!data.providerId || data.vendor) return data
  const provider = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { name: true } })
  return { ...data, vendor: provider?.name ?? null }
}

export async function createServiceRecord(data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const record = await prisma.serviceRecord.create({ data: await withProviderVendor(clean(parsed.data, session.user.id)) })
  revalidatePath(assetHref(parsed.data.assetType, parsed.data.assetId))
  revalidatePath("/records")
  return { success: true, id: record.id }
}

export async function updateServiceRecord(id: string, data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.serviceRecord.update({ where: { id }, data: await withProviderVendor(clean(parsed.data, session.user.id)) })
  revalidatePath(assetHref(parsed.data.assetType, parsed.data.assetId))
  revalidatePath("/records")
  return { success: true }
}

export async function deleteServiceRecord(id: string, assetType: AssetType, assetId: string) {
  const session = await auth()
  if (!session) redirect("/login")

  // Look the record up first: the id arrives from the client and must be proven
  // real before it is used to build a directory path.
  const record = await prisma.serviceRecord.findUnique({ where: { id }, select: { id: true } })
  if (!record) return { error: "Not found" }

  await prisma.serviceRecord.delete({ where: { id: record.id } })
  await rm(resolveUploadPath("service", record.id), { recursive: true, force: true })

  revalidatePath(assetHref(assetType, assetId))
  revalidatePath("/records")
  return { success: true }
}
