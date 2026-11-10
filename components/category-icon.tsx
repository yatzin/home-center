import {
  Bike, CalendarCheck, Car, Cog, Droplets, Eye, FlaskConical, Fuel, Hammer, HeartPulse, House, Key, Leaf,
  MoreHorizontal, Package, Paintbrush, Pill, Receipt, Refrigerator, Search, ShieldCheck, Smile, Sofa, Stethoscope,
  Syringe, Tag, Thermometer, TreePine, TrendingUp, Tv, Wrench, Zap, type LucideIcon,
} from "lucide-react"

/** The icons an admin can give a category. The name is what's stored. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Tag, CalendarCheck, Wrench, TrendingUp, Search, Cog, Stethoscope, Pill, FlaskConical, Smile, Eye, Syringe, HeartPulse,
  MoreHorizontal, Refrigerator, Thermometer, Droplets, Tv, Hammer, TreePine, ShieldCheck, Zap, Car, Bike, Fuel, House,
  Sofa, Paintbrush, Package, Receipt, Leaf, Key,
}

export function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = name ? CATEGORY_ICONS[name] : undefined
  return Icon ? <Icon className={className ?? "h-4 w-4"} aria-hidden="true" /> : null
}

/** A category's icon (when it has one) beside its name. For select items, badges and table cells. */
export function CategoryName({ icon, label, iconClassName }: { icon: string | null | undefined; label: string; iconClassName?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <CategoryIcon name={icon} className={iconClassName ?? "h-3.5 w-3.5 shrink-0"} />
      <span className="truncate">{label}</span>
    </span>
  )
}
