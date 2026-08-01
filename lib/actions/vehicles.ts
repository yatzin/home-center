"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { rm } from "fs/promises"
import path from "path"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().int().min(1900).max(2100),
  vin: z.string().optional(),
  color: z.string().optional(),
  purchaseDate: z.string().optional(),
  currentMileage: z.coerce.number().int().min(0).optional().or(z.literal("")),
  notes: z.string().optional(),
})

function clean(v: z.infer<typeof schema>) {
  return {
    name: v.name,
    make: v.make,
    model: v.model,
    year: Number(v.year),
    vin: v.vin || null,
    color: v.color || null,
    purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
    currentMileage: v.currentMileage === "" || v.currentMileage === undefined ? null : Number(v.currentMileage),
    notes: v.notes || null,
  }
}

export async function createVehicle(data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.vehicle.create({ data: clean(parsed.data) })
  revalidatePath("/assets/vehicles")
  return { success: true }
}

export async function updateVehicle(id: string, data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.vehicle.update({ where: { id }, data: clean(parsed.data) })
  revalidatePath("/assets/vehicles")
  revalidatePath(`/assets/vehicles/${id}`)
  return { success: true }
}

export async function deleteVehicle(id: string) {
  const session = await auth()
  if (!session) redirect("/login")

  await prisma.vehicle.delete({ where: { id } })

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  await rm(path.join(uploadDir, "vehicles", id), { recursive: true, force: true })

  revalidatePath("/assets/vehicles")
  return { success: true }
}
