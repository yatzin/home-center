// Pure, client-safe category model. Built-in categories live here as defaults;
// the Category table holds admin edits to them (rename, hide, reorder, icon,
// colour) and any custom categories. Records store only the category `key`, so
// a rename never touches a record and every key ever written stays resolvable.

export type CategoryScope = "SERVICE" | "EQUIPMENT"
export type CategoryAudience = "ALL" | "ASSET" | "PERSON"

/** What records store. Built-ins are the former enum values; custom keys look like `c_k3j9x2`. */
export type ServiceCategory = string
export type EquipmentCategory = string

export type CategoryDef = {
  scope: CategoryScope
  key: string
  label: string
  icon: string | null
  /** A hex colour, a CSS var(), or null for automatic. */
  color: string | null
  audience: CategoryAudience
  hidden: boolean
  sortOrder: number
  builtIn: boolean
}

/** The Category table row shape the merge reads (a subset of the Prisma model). */
export type CategoryRow = Omit<CategoryDef, "builtIn"> & { builtIn?: boolean }

type Seed = [key: string, label: string, audience: CategoryAudience, color: string | null, icon: string | null]

const SERVICE_SEEDS: Seed[] = [
  ["ROUTINE", "Routine", "ASSET", "var(--cost-routine)", "CalendarCheck"],
  ["REPAIR", "Repair", "ASSET", "var(--cost-repair)", "Wrench"],
  ["UPGRADE", "Upgrade", "ASSET", "var(--cost-upgrade)", "TrendingUp"],
  ["INSPECTION", "Inspection", "ASSET", "var(--cost-inspection)", "Search"],
  ["PARTS", "Parts", "ASSET", "var(--cost-parts)", "Cog"],
  ["OFFICE_VISIT", "Office visit", "PERSON", "var(--cost-office-visit)", "Stethoscope"],
  ["PRESCRIPTION", "Prescription", "PERSON", "var(--cost-prescription)", "Pill"],
  ["LAB", "Lab / imaging", "PERSON", "var(--cost-lab)", "FlaskConical"],
  ["DENTAL", "Dental", "PERSON", "var(--cost-dental)", "Smile"],
  ["VISION", "Vision", "PERSON", "var(--cost-vision)", "Eye"],
  ["PROCEDURE", "Procedure", "PERSON", "var(--cost-procedure)", "Syringe"],
  ["THERAPY", "Therapy", "PERSON", "var(--cost-therapy)", "HeartPulse"],
  ["OTHER", "Other", "ALL", "var(--cost-other)", "MoreHorizontal"],
]

const EQUIPMENT_SEEDS: Seed[] = [
  ["APPLIANCE", "Appliance", "ALL", null, "Refrigerator"],
  ["HVAC", "Heating & Cooling", "ALL", null, "Thermometer"],
  ["WATER", "Water & Plumbing", "ALL", null, "Droplets"],
  ["ELECTRONICS", "Electronics", "ALL", null, "Tv"],
  ["TOOL", "Tools", "ALL", null, "Hammer"],
  ["OUTDOOR", "Outdoor & Lawn", "ALL", null, "TreePine"],
  ["SECURITY", "Security", "ALL", null, "ShieldCheck"],
  ["OTHER", "Other", "ALL", null, "MoreHorizontal"],
]

function seeds(scope: CategoryScope, list: Seed[]): CategoryDef[] {
  return list.map(([key, label, audience, color, icon], i) => ({
    scope, key, label, icon, color, audience, hidden: false, sortOrder: (i + 1) * 10, builtIn: true,
  }))
}

export const BUILTIN_CATEGORIES: CategoryDef[] = [
  ...seeds("SERVICE", SERVICE_SEEDS),
  ...seeds("EQUIPMENT", EQUIPMENT_SEEDS),
]

export const UNCATEGORIZED = "UNCATEGORIZED"

/** Stable colours for custom categories that were given none, picked by key so they never shift. */
const AUTO_COLORS = ["#0e7490", "#7c3aed", "#b45309", "#be185d", "#4d7c0f", "#1d4ed8", "#9f1239", "#0f766e"]

function autoColor(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AUTO_COLORS[h % AUTO_COLORS.length]
}

/**
 * Built-ins with the admin's edits applied, plus custom rows, sorted by
 * sortOrder. Built-in rows can change label, icon, colour, hidden and order,
 * never key, scope or audience.
 */
export function mergeCategories(rows: CategoryRow[]): CategoryDef[] {
  const byId = new Map(rows.map((r) => [`${r.scope}:${r.key}`, r]))
  const out: CategoryDef[] = BUILTIN_CATEGORIES.map((b) => {
    const r = byId.get(`${b.scope}:${b.key}`)
    return r ? { ...b, label: r.label, icon: r.icon, color: r.color ?? b.color, hidden: r.hidden, sortOrder: r.sortOrder } : b
  })
  const builtinIds = new Set(BUILTIN_CATEGORIES.map((b) => `${b.scope}:${b.key}`))
  for (const r of rows) {
    if (!builtinIds.has(`${r.scope}:${r.key}`)) out.push({ ...r, builtIn: false })
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

export const DEFAULT_CATEGORIES: CategoryDef[] = mergeCategories([])

const inScope = (defs: CategoryDef[], scope: CategoryScope) => defs.filter((d) => d.scope === scope)

/** Offered choices for the service-record form: visible ones for this kind of asset, plus `keep` (a record's current value) even if hidden. */
export function serviceChoices(defs: CategoryDef[], forPerson: boolean, keep?: string | null): CategoryDef[] {
  const want: CategoryAudience = forPerson ? "PERSON" : "ASSET"
  return inScope(defs, "SERVICE").filter((d) => (d.audience === "ALL" || d.audience === want) && (!d.hidden || d.key === keep))
}

export function equipmentChoices(defs: CategoryDef[], keep?: string | null): CategoryDef[] {
  return inScope(defs, "EQUIPMENT").filter((d) => !d.hidden || d.key === keep)
}

function find(defs: CategoryDef[], scope: CategoryScope, key: string) {
  return defs.find((d) => d.scope === scope && d.key === key)
}

/** A readable fallback for a key with no definition (deleted category): "OFFICE_VISIT" -> "Office visit". */
function humanize(key: string): string {
  const t = key.replace(/^c_/, "").replace(/_/g, " ").trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function serviceLabel(key: string | null | undefined, defs: CategoryDef[] = DEFAULT_CATEGORIES): string {
  if (!key || key === UNCATEGORIZED) return "Uncategorized"
  return find(defs, "SERVICE", key)?.label ?? humanize(key)
}

export function equipmentLabel(key: string | null | undefined, defs: CategoryDef[] = DEFAULT_CATEGORIES): string {
  if (!key) return "Other"
  return find(defs, "EQUIPMENT", key)?.label ?? humanize(key)
}

export function serviceIcon(key: string | null | undefined, defs: CategoryDef[] = DEFAULT_CATEGORIES): string | null {
  return key ? find(defs, "SERVICE", key)?.icon ?? null : null
}

export function equipmentIcon(key: string | null | undefined, defs: CategoryDef[] = DEFAULT_CATEGORIES): string | null {
  return key ? find(defs, "EQUIPMENT", key)?.icon ?? null : null
}

export function serviceColor(key: string, defs: CategoryDef[] = DEFAULT_CATEGORIES): string {
  if (key === UNCATEGORIZED) return "var(--cost-uncategorized)"
  return find(defs, "SERVICE", key)?.color ?? autoColor(key)
}

/** Service keys in chart order (settings order), Uncategorized last. Keys with no definition are not listed. */
export function serviceOrder(defs: CategoryDef[] = DEFAULT_CATEGORIES): string[] {
  return [...inScope(defs, "SERVICE").map((d) => d.key), UNCATEGORIZED]
}

/** Slug for a new custom category's key. */
export function newCategoryKey(): string {
  return `c_${Math.random().toString(36).slice(2, 8)}`
}
