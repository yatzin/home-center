// Card type icon names (lib/dashboard/card-types.ts) to their lucide
// components: an explicit map, so only these icons are bundled. A new icon
// name in CARD_ICON_NAMES fails to type-check here until it is mapped.
import {
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Car,
  ChartPie,
  Clock,
  DoorOpen,
  HeartPulse,
  Hourglass,
  Inbox,
  Refrigerator,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { CardIconName } from "@/lib/dashboard/card-types"

export const CARD_ICONS: Record<CardIconName, LucideIcon> = {
  Building2,
  Car,
  HeartPulse,
  Refrigerator,
  DoorOpen,
  Wrench,
  ShieldCheck,
  Calendar,
  Inbox,
  Clock,
  ShieldAlert,
  TrendingUp,
  ChartPie,
  Type,
  CalendarClock,
  CalendarRange,
  Hourglass,
  CalendarDays,
}
