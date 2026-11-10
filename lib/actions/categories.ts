"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { loadCategories } from "@/lib/categories-server"
import { BUILTIN_CATEGORIES, newCategoryKey, type CategoryDef } from "@/lib/categories"
import { CATEGORY_ICONS } from "@/components/category-icon"

type Result = { error: string } | { success: true }

async function requireAdmin() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")
}

// Every page that shows a category label or colour.
function refresh() {
  revalidatePath("/", "layout")
}

const saveSchema = z.object({
  scope: z.enum(["SERVICE", "EQUIPMENT"]),
  /** Absent: create a custom category. */
  key: z.string().max(60).optional(),
  label: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  icon: z.string().nullable().refine((v) => v === null || v in CATEGORY_ICONS, "Unknown icon"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must look like #2a78d6").nullable(),
  audience: z.enum(["ALL", "ASSET", "PERSON"]),
  hidden: z.boolean(),
})
export type SaveCategoryInput = z.infer<typeof saveSchema>

export async function saveCategory(data: SaveCategoryInput): Promise<Result> {
  await requireAdmin()
  const parsed = saveSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." }
  const v = parsed.data
  const defs = await loadCategories()
  const scoped = defs.filter((d) => d.scope === v.scope)
  if (scoped.some((d) => d.key !== v.key && d.label.toLowerCase() === v.label.toLowerCase())) {
    return { error: "Another category already has that name." }
  }

  if (!v.key) {
    // Custom ones go after everything that exists.
    const sortOrder = Math.max(0, ...scoped.map((d) => d.sortOrder)) + 10
    await prisma.category.create({
      data: { scope: v.scope, key: newCategoryKey(), label: v.label, icon: v.icon, color: v.color, audience: v.scope === "SERVICE" ? v.audience : "ALL", hidden: v.hidden, sortOrder },
    })
  } else {
    const existing = scoped.find((d) => d.key === v.key)
    if (!existing) return { error: "That category no longer exists." }
    // Built-ins keep their audience; only the display fields change.
    const fields = { label: v.label, icon: v.icon, color: v.color, hidden: v.hidden, ...(existing.builtIn ? {} : { audience: v.scope === "SERVICE" ? v.audience : "ALL" as const }) }
    await prisma.category.upsert({
      where: { scope_key: { scope: v.scope, key: v.key } },
      update: fields,
      create: { scope: v.scope, key: v.key, audience: existing.audience, sortOrder: existing.sortOrder, builtIn: existing.builtIn, ...fields },
    })
  }
  refresh()
  return { success: true }
}

/** Saves the order: `keys` is every category of the scope, top to bottom. */
export async function reorderCategories(scope: "SERVICE" | "EQUIPMENT", keys: string[]): Promise<Result> {
  await requireAdmin()
  const defs = (await loadCategories()).filter((d) => d.scope === scope)
  const byKey = new Map(defs.map((d) => [d.key, d]))
  if (keys.length !== defs.length || !keys.every((k) => byKey.has(k))) return { error: "The list changed. Reload and try again." }
  await prisma.$transaction(
    keys.map((key, i) => {
      const d = byKey.get(key) as CategoryDef
      return prisma.category.upsert({
        where: { scope_key: { scope, key } },
        update: { sortOrder: (i + 1) * 10 },
        create: { scope, key, label: d.label, icon: d.icon, color: d.color, audience: d.audience, hidden: d.hidden, builtIn: d.builtIn, sortOrder: (i + 1) * 10 },
      })
    })
  )
  refresh()
  return { success: true }
}

/** Custom categories only, and only while no record uses one: hide it instead. */
export async function deleteCategory(scope: "SERVICE" | "EQUIPMENT", key: string): Promise<Result> {
  await requireAdmin()
  const def = (await loadCategories()).find((d) => d.scope === scope && d.key === key)
  if (!def) return { error: "That category no longer exists." }
  if (def.builtIn) return { error: "Built-in categories can't be deleted. Hide it instead." }
  const used = scope === "SERVICE"
    ? await prisma.serviceRecord.count({ where: { category: key } })
    : await prisma.equipment.count({ where: { category: key } })
  if (used > 0) return { error: `${used} record${used === 1 ? " uses" : "s use"} this category. Hide it instead; they keep their category.` }
  await prisma.category.delete({ where: { scope_key: { scope, key } } })
  refresh()
  return { success: true }
}

/** Put a built-in back to its default name, icon, colour and visibility. Its place in the order is kept. */
export async function resetCategory(scope: "SERVICE" | "EQUIPMENT", key: string): Promise<Result> {
  await requireAdmin()
  const base = BUILTIN_CATEGORIES.find((d) => d.scope === scope && d.key === key)
  if (!base) return { error: "Only built-in categories can be reset." }
  await prisma.category.updateMany({ where: { scope, key }, data: { label: base.label, icon: base.icon, color: null, hidden: false } })
  refresh()
  return { success: true }
}
