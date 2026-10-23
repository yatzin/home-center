// Client registry of card views, keyed by card type id (lib/dashboard/card-types).
// A new card is one view module registered here plus its loader in
// lib/dashboard/loaders.ts.
import type { ComponentType } from "react"
import { ActiveWarrantiesCard, DueMaintenanceCard, RecordsCard } from "./count-card"
import { ExpiringWarrantiesCard } from "./expiring-warranties-card"
import { IntakeView } from "./intake-view"
import { RemindersCard } from "./reminders-card"
import { RoomsCard } from "./rooms-card"
import { SpendingBreakdownCard } from "./spending-breakdown"
import { SpendingTrendCard } from "./spending-trend"
import { EquipmentCard, PeopleCard, PropertiesCard, VehiclesCard } from "./stat-card"
import type { CardViewProps } from "./types"

export type { CardViewProps } from "./types"

export const CARD_VIEWS: Record<string, ComponentType<CardViewProps>> = {
  properties: PropertiesCard,
  vehicles: VehiclesCard,
  people: PeopleCard,
  equipment: EquipmentCard,
  rooms: RoomsCard,
  records: RecordsCard,
  "active-warranties": ActiveWarrantiesCard,
  "due-maintenance": DueMaintenanceCard,
  reminders: RemindersCard,
  "expiring-warranties": ExpiringWarrantiesCard,
  intake: IntakeView,
  "spending-trend": SpendingTrendCard,
  "spending-breakdown": SpendingBreakdownCard,
}
