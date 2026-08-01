"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const schema = z.object({
  assetId: z.string().min(1),
  assetType: z.enum(["PROPERTY", "VEHICLE"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  intervalDays: z.coerce.number().int().min(1).optional().or(z.literal("")),
  intervalMiles: z.coerce.number().int().min(1).optional().or(z.literal("")),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.coerce.number().int().min(0).optional().or(z.literal("")),
  reminderDaysBefore: z.coerce.number().int().min(1).default(14),
})

function clean(v: z.infer<typeof schema>) {
  return {
    assetId: v.assetId,
    assetType: v.assetType,
    title: v.title,
    description: v.description || null,
    intervalDays: v.intervalDays === "" || !v.intervalDays ? null : Number(v.intervalDays),
    intervalMiles: v.intervalMiles === "" || !v.intervalMiles ? null : Number(v.intervalMiles),
    nextDueDate: v.nextDueDate ? new Date(v.nextDueDate) : null,
    nextDueMileage: v.nextDueMileage === "" || !v.nextDueMileage ? null : Number(v.nextDueMileage),
    reminderDaysBefore: Number(v.reminderDaysBefore) || 14,
    isActive: true,
  }
}

export async function createMaintenanceSchedule(data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  await prisma.maintenanceSchedule.create({ data: clean(parsed.data) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/maintenance")
  return { success: true }
}

export async function updateMaintenanceSchedule(id: string, data: z.infer<typeof schema>) {
  const session = await auth()
  if (!session) redirect("/login")
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  await prisma.maintenanceSchedule.update({ where: { id }, data: clean(parsed.data) })
  revalidatePath(`/assets/${parsed.data.assetType.toLowerCase()}s/${parsed.data.assetId}`)
  revalidatePath("/maintenance")
  return { success: true }
}

export async function deleteMaintenanceSchedule(id: string, assetType: string, assetId: string) {
  const session = await auth()
  if (!session) redirect("/login")
  await prisma.maintenanceSchedule.delete({ where: { id } })
  revalidatePath(`/assets/${assetType.toLowerCase()}s/${assetId}`)
  revalidatePath("/maintenance")
  return { success: true }
}

const completeSchema = z.object({
  completedDate: z.string().min(1),
  completedMileage: z.coerce.number().int().min(0).optional().or(z.literal("")),
})

export async function completeMaintenanceSchedule(id: string, data: z.infer<typeof completeSchema>) {
  const session = await auth()
  if (!session) redirect("/login")

  const parsed = completeSchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid input" }

  const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id } })
  if (!schedule) return { error: "Not found" }

  const completedDate = new Date(parsed.data.completedDate)
  const completedMileage = parsed.data.completedMileage === "" || !parsed.data.completedMileage
    ? null
    : Number(parsed.data.completedMileage)

  // Compute next due date/mileage from the interval
  const nextDueDate = schedule.intervalDays
    ? new Date(new Date(completedDate).setDate(completedDate.getDate() + schedule.intervalDays))
    : schedule.nextDueDate

  const nextDueMileage = schedule.intervalMiles && completedMileage != null
    ? completedMileage + schedule.intervalMiles
    : schedule.nextDueMileage

  await prisma.maintenanceSchedule.update({
    where: { id },
    data: { lastCompletedDate: completedDate, lastCompletedMileage: completedMileage, nextDueDate, nextDueMileage },
  })

  // Auto-update vehicle current mileage if completing a vehicle schedule with mileage
  if (schedule.assetType === "VEHICLE" && completedMileage != null) {
    await prisma.vehicle.updateMany({
      where: { id: schedule.assetId, currentMileage: { lt: completedMileage } },
      data: { currentMileage: completedMileage },
    })
  }

  revalidatePath(`/assets/${schedule.assetType.toLowerCase()}s/${schedule.assetId}`)
  revalidatePath("/maintenance")
  return { success: true }
}
