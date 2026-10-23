// Client registry of card views, keyed by card type id (lib/dashboard/card-types).
// A new card is one view module registered here plus its loader in
// lib/dashboard/loaders.ts.
import type { ComponentType } from "react"
import { PropertiesCard } from "./stat-card"
import type { CardViewProps } from "./types"

export type { CardViewProps } from "./types"

export const CARD_VIEWS: Record<string, ComponentType<CardViewProps>> = {
  properties: PropertiesCard,
}
