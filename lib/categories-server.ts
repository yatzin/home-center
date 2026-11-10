import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { mergeCategories, type CategoryDef, type CategoryScope } from "@/lib/categories"

/** Built-in categories with the admin's edits, plus custom ones. Once per request. */
export const loadCategories = cache(async (): Promise<CategoryDef[]> => {
  const rows = await prisma.category.findMany()
  return mergeCategories(rows)
})

/** True when `key` is a defined category of that scope (hidden ones count: an old record keeps its value). */
export async function categoryExists(scope: CategoryScope, key: string): Promise<boolean> {
  return (await loadCategories()).some((d) => d.scope === scope && d.key === key)
}
