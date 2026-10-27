"use client"

import Link from "next/link"
import { Building2, Car, ChevronRight, HeartPulse, Refrigerator, type LucideIcon } from "lucide-react"
import { assetImageSrc } from "@/components/asset-image"
import { InitialsTile } from "@/components/dashboard/summary-card"
import { useSize } from "@/components/charts/primitives/use-width"
import { assetHref } from "@/lib/assets"
import { ASSET_TIERS } from "@/lib/dashboard/card-types"
import { mosaicFit } from "@/lib/dashboard/mosaic-fit"
import { cn } from "@/lib/utils"
import type { AssetType } from "@/app/generated/prisma/client"
import type { AssetCardData, AssetCardItem } from "@/lib/dashboard/loaders"
import { AvatarStrip } from "./avatar-strip"
import { ChooseAnother } from "./card-configure"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// An asset card ("stat card"): avatars only at long, thin sizes (one row, one
// or two columns: avatar-strip.tsx), a photo mosaic from 3 columns and 2 rows,
// and a per-item list when large. Properties is the first; Vehicles, Equipment
// and People reuse it with their own spec (Rooms has its own view).

export type AssetCardSpec = {
  assetType: AssetType
  /** Plural label: "Properties". */
  label: string
  icon: LucideIcon
  listHref: string
  emptyMessage: string
  addLabel: string
  missingMessage: string
  openLabel: string
}

const tierName = (tier: number) => ASSET_TIERS[tier]?.name

function isAssetCardData(data: unknown): data is AssetCardData {
  if (typeof data !== "object" || data === null || !("missing" in data)) return false
  return data.missing === true || ("items" in data && Array.isArray(data.items))
}

function Tile({ spec, item, className, text }: { spec: AssetCardSpec; item: AssetCardItem; className?: string; text?: string }) {
  if (item.imageFilename) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route
      <img
        src={assetImageSrc(spec.assetType, item.id, item.imageFilename)}
        alt={item.name}
        loading="lazy"
        className={cn("object-cover", className)}
      />
    )
  }
  return (
    <InitialsTile
      thumbnail={{ assetType: spec.assetType, assetId: item.id, imageFilename: null, name: item.name }}
      className={cn(className, text)}
    />
  )
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </div>
  )
}

/** Count (or the one item's name) beside the type's icon: the footer of the mosaic tier. */
function StatRow({ spec, data, className }: { spec: AssetCardSpec; data: Extract<AssetCardData, { missing: false }>; className?: string }) {
  const item = data.single ? data.items[0] : undefined
  return (
    <Link
      href={item ? assetHref(spec.assetType, item.id) : spec.listHref}
      className={cn("flex items-center justify-between gap-3 px-5 transition-colors duration-150 hover:bg-muted/60", className)}
    >
      {item ? (
        <div className="min-w-0">
          <div className="truncate font-heading text-base font-semibold leading-tight">{item.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</div>
        </div>
      ) : (
        <div className="min-w-0">
          <div className="text-[28px] font-semibold leading-none tabular-nums">{data.total}</div>
          <div className="mt-2 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{spec.label}</div>
        </div>
      )}
      <IconChip icon={spec.icon} />
    </Link>
  )
}

function Mosaic({ spec, data }: { spec: AssetCardSpec; data: Extract<AssetCardData, { missing: false }> }) {
  const [boxRef, { width, height }] = useSize<HTMLDivElement>()
  const measured = width > 0 && height > 0
  // Until measured (server render, first paint) show the first four, as a 2x2.
  const fit = measured
    ? mosaicFit({ width, height, itemCount: data.items.length, total: data.total })
    : mosaicFit({ width: 150, height: 150, itemCount: data.items.length, total: data.total })
  const shown = data.items.slice(0, fit.visible)
  return (
    <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute inset-0 grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${fit.rows}, minmax(0, 1fr))` }}
      >
        {shown.map((item, i) => (
          // The badge sits beside the link, not inside it, so the link's name is just the item's.
          <div
            key={item.id}
            className="relative min-h-0 min-w-0 overflow-hidden"
            style={i === shown.length - 1 && fit.lastSpan > 1 ? { gridColumn: `span ${fit.lastSpan}` } : undefined}
          >
            <Link href={assetHref(spec.assetType, item.id)} aria-label={item.name} className="group block h-full overflow-hidden">
              <Tile
                spec={spec}
                item={item}
                className="h-full w-full transition-transform duration-150 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                text="text-2xl"
              />
            </Link>
            {i === shown.length - 1 && fit.hidden > 0 && (
              <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                +{fit.hidden} more
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ItemList({ spec, data }: { spec: AssetCardSpec; data: Extract<AssetCardData, { missing: false }> }) {
  const remaining = data.total - data.items.length
  return (
    <CardShell title={spec.label} href={spec.listHref} scroll>
      <ul className="space-y-0.5 px-3 pb-3">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              href={assetHref(spec.assetType, item.id)}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/60"
            >
              <Tile spec={spec} item={item} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" text="text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
                {item.facts && <p className="truncate text-xs text-muted-foreground">{item.facts}</p>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <Link
          href={spec.listHref}
          className="mx-5 mb-4 block rounded-md py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
        >
          +{remaining} more
        </Link>
      )}
    </CardShell>
  )
}

/** One item, large: its photo beside its details. */
function ItemDetail({ spec, item }: { spec: AssetCardSpec; item: AssetCardItem }) {
  const href = assetHref(spec.assetType, item.id)
  return (
    <div className="flex h-full min-h-0">
      <Link href={href} aria-label={item.name} className="group relative block w-2/5 shrink-0 overflow-hidden">
        <Tile spec={spec} item={item} className="h-full w-full transition-transform duration-150 group-hover:scale-105 motion-reduce:group-hover:scale-100" text="text-3xl" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-5">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{spec.label}</h2>
        <p className="mt-1 truncate font-heading text-lg font-semibold leading-tight">{item.name}</p>
        {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
        {item.facts && <p className="text-xs text-muted-foreground">{item.facts}</p>}
        <Link
          href={href}
          className="mt-auto self-start rounded-md px-2 py-1 -ml-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
        >
          {spec.openLabel} →
        </Link>
      </div>
    </div>
  )
}

export function AssetStatCard({ spec, data, tier, size }: CardViewProps & { spec: AssetCardSpec }) {
  if (!isAssetCardData(data)) throw new Error(`Unexpected ${spec.label} card data`)

  // Long, thin sizes: avatars only (their own missing and empty states).
  const look = ASSET_TIERS[tier]?.look
  if (look) return <AvatarStrip spec={spec} data={data} look={look} size={size} />

  if (data.missing) {
    return (
      <CardShell title={spec.label}>
        <CardMessage icon={spec.icon} message={spec.missingMessage} footer={<ChooseAnother />} />
      </CardShell>
    )
  }

  if (data.total === 0) {
    const action = { href: spec.listHref, label: spec.addLabel }
    return (
      <CardShell title={spec.label}>
        <CardMessage icon={spec.icon} message={spec.emptyMessage} action={action} />
      </CardShell>
    )
  }

  if (tierName(tier) === "thumbnails") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Mosaic spec={spec} data={data} />
        <StatRow spec={spec} data={data} className="shrink-0 py-3" />
      </div>
    )
  }

  return data.single ? <ItemDetail spec={spec} item={data.items[0]} /> : <ItemList spec={spec} data={data} />
}

export const PROPERTIES_SPEC: AssetCardSpec = {
  assetType: "PROPERTY",
  label: "Properties",
  icon: Building2,
  listHref: "/assets/properties",
  emptyMessage: "No properties yet",
  addLabel: "Add a property",
  missingMessage: "This property no longer exists.",
  openLabel: "Open property",
}

export function PropertiesCard(props: CardViewProps) {
  return <AssetStatCard {...props} spec={PROPERTIES_SPEC} />
}

export const VEHICLES_SPEC: AssetCardSpec = {
  assetType: "VEHICLE",
  label: "Vehicles",
  icon: Car,
  listHref: "/assets/vehicles",
  emptyMessage: "No vehicles yet",
  addLabel: "Add a vehicle",
  missingMessage: "This vehicle no longer exists.",
  openLabel: "Open vehicle",
}

export function VehiclesCard(props: CardViewProps) {
  return <AssetStatCard {...props} spec={VEHICLES_SPEC} />
}

export const PEOPLE_SPEC: AssetCardSpec = {
  assetType: "PERSON",
  label: "People",
  icon: HeartPulse,
  listHref: "/assets/people",
  emptyMessage: "No people yet",
  addLabel: "Add a person",
  missingMessage: "This person no longer exists.",
  openLabel: "Open profile",
}

export function PeopleCard(props: CardViewProps) {
  return <AssetStatCard {...props} spec={PEOPLE_SPEC} />
}

export const EQUIPMENT_SPEC: AssetCardSpec = {
  assetType: "EQUIPMENT",
  label: "Equipment",
  icon: Refrigerator,
  listHref: "/assets/equipment",
  emptyMessage: "No equipment yet",
  addLabel: "Add equipment",
  missingMessage: "This equipment no longer exists.",
  openLabel: "Open equipment",
}

export function EquipmentCard(props: CardViewProps) {
  return <AssetStatCard {...props} spec={EQUIPMENT_SPEC} />
}
