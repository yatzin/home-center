"use client"

import { useMemo } from "react"
import { cardType, tierOf } from "@/lib/dashboard/card-types"
import type { Size } from "@/lib/dashboard/grid"

export type LayoutMode = "large" | "phone"

/** The richest content tier a card of this type can show at this size (0 for an unknown type). */
export function useCardTier(typeId: string, size: Size, mode: LayoutMode): number {
  const { w, h } = size
  return useMemo(() => {
    const def = cardType(typeId)
    return def ? tierOf(def, { w, h }, mode) : 0
  }, [typeId, w, h, mode])
}
