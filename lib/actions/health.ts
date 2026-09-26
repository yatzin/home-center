"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { allergySchema, conditionSchema, immunizationSchema, medicationSchema } from "@/lib/health-schemas"
import { nextRefillFrom } from "@/lib/health"
import { removeUploadDir } from "@/lib/upload-fs"
import type { ActionResult, FormValues } from "@/lib/form-types"

async function requireSession() {
  const session = await auth()
  if (!session) redirect("/login")
  return session
}

async function personExists(personId: string) {
  return !!(await prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))
}

function revalidatePerson(personId: string) {
  revalidatePath(`/assets/people/${personId}`)
  revalidatePath("/assets/people")
}

const NOT_FOUND: ActionResult = { error: "Not found" }

// ─── Conditions ───────────────────────────────────────────────────────────────

export async function createCondition(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = conditionSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.healthCondition.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateCondition(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = conditionSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.healthCondition.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.healthCondition.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteCondition(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.healthCondition.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.healthCondition.delete({ where: { id: existing.id } })
  await removeUploadDir("condition", existing.id)
  revalidatePerson(existing.personId)
  return { success: true }
}

// ─── Medications ──────────────────────────────────────────────────────────────

export async function createMedication(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = medicationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.medication.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateMedication(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = medicationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.medication.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.medication.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteMedication(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.medication.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.medication.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}

/// Picked up today: the next refill is one interval from today, not from the
/// old due date, so a late pickup doesn't leave the next one already overdue.
export async function markMedicationRefilled(id: string): Promise<ActionResult> {
  await requireSession()
  const med = await prisma.medication.findUnique({ where: { id }, select: { personId: true, refillIntervalDays: true } })
  if (!med) return NOT_FOUND
  if (!med.refillIntervalDays) return { error: "Set a refill interval first." }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.medication.update({ where: { id }, data: { nextRefillDate: nextRefillFrom(today, med.refillIntervalDays) } })
  revalidatePerson(med.personId)
  return { success: true }
}

// ─── Allergies ────────────────────────────────────────────────────────────────

export async function createAllergy(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = allergySchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.allergy.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateAllergy(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = allergySchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.allergy.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.allergy.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteAllergy(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.allergy.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.allergy.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}

// ─── Immunizations ────────────────────────────────────────────────────────────

export async function createImmunization(personId: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = immunizationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  if (!(await personExists(personId))) return NOT_FOUND

  const row = await prisma.immunization.create({ data: { ...parsed.data, personId } })
  revalidatePerson(personId)
  return { success: true, id: row.id }
}

export async function updateImmunization(id: string, values: FormValues): Promise<ActionResult> {
  await requireSession()
  const parsed = immunizationSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }
  const existing = await prisma.immunization.findUnique({ where: { id }, select: { personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.immunization.update({ where: { id }, data: parsed.data })
  revalidatePerson(existing.personId)
  return { success: true }
}

export async function deleteImmunization(id: string): Promise<ActionResult> {
  await requireSession()
  const existing = await prisma.immunization.findUnique({ where: { id }, select: { id: true, personId: true } })
  if (!existing) return NOT_FOUND

  await prisma.immunization.delete({ where: { id: existing.id } })
  revalidatePerson(existing.personId)
  return { success: true }
}
