"use client"

import { createContext, useContext } from "react"
import { DEFAULT_CATEGORIES, type CategoryDef } from "@/lib/categories"

const CategoryContext = createContext<CategoryDef[]>(DEFAULT_CATEGORIES)

/** Settings → Categories, for client components (forms, lists). Falls back to the built-ins outside a provider. */
export function CategoryProvider({ value, children }: { value: CategoryDef[]; children: React.ReactNode }) {
  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>
}

export function useCategories(): CategoryDef[] {
  return useContext(CategoryContext)
}
