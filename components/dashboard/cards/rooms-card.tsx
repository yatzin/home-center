"use client"

import Link from "next/link"
import { ChevronRight, DoorOpen } from "lucide-react"
import type { RoomsCardData } from "@/lib/dashboard/loaders"
import { cn } from "@/lib/utils"
import { CardMessage, CardShell } from "./card-shell"
import type { CardViewProps } from "./types"

// Rooms live inside their property's page (its Rooms tab), so every link here
// goes to a property. A count at the smallest size, rooms-per-property when
// there is room, and the room names themselves at the largest tier.

const TIER_COUNT = 0
const TIER_PROPERTIES = 1

const LABEL = "Rooms"
const LIST_HREF = "/assets/properties"
const MISSING_MESSAGE = "This property no longer exists."
const MISSING_NOTE = "An admin can choose another one for this card."

function isRoomsData(data: unknown): data is RoomsCardData {
  if (typeof data !== "object" || data === null || !("missing" in data)) return false
  return data.missing === true || ("properties" in data && Array.isArray(data.properties))
}

const roomsHref = (propertyId: string, roomId?: string) =>
  `/assets/properties/${propertyId}?tab=rooms${roomId ? `&open=${roomId}` : ""}`

const roomsWord = (n: number) => `${n} ${n === 1 ? "room" : "rooms"}`

function CountRow({ data, className }: { data: Extract<RoomsCardData, { missing: false }>; className?: string }) {
  const only = data.single ? data.properties[0] : undefined
  return (
    <Link
      href={only ? roomsHref(only.propertyId) : LIST_HREF}
      className={cn("flex items-center justify-between gap-3 px-5 transition-colors duration-150 hover:bg-muted/60", className)}
    >
      <div className="min-w-0">
        <div className="text-[28px] font-semibold leading-none tabular-nums">{data.total}</div>
        <div className="mt-2 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{LABEL}</div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <DoorOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </div>
    </Link>
  )
}

export function RoomsCard({ data, tier }: CardViewProps) {
  if (!isRoomsData(data)) throw new Error("Unexpected Rooms card data")

  if (data.missing) {
    return (
      <CardShell title={LABEL}>
        <CardMessage icon={DoorOpen} message={MISSING_MESSAGE} note={MISSING_NOTE} />
      </CardShell>
    )
  }

  if (tier === TIER_COUNT) return <CountRow data={data} className="h-full" />

  if (data.total === 0) {
    return (
      <CardShell title={LABEL} href={LIST_HREF}>
        <CardMessage icon={DoorOpen} message="No rooms yet" action={{ href: LIST_HREF, label: "Add rooms to a property" }} />
      </CardShell>
    )
  }

  const remaining = data.total - data.properties.reduce((n, p) => n + p.rooms.length, 0)

  if (tier === TIER_PROPERTIES) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CountRow data={data} className="shrink-0 py-3" />
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto border-t px-3 py-1.5">
          {data.properties.map((p) => (
            <li key={p.propertyId}>
              <Link
                href={roomsHref(p.propertyId)}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.propertyName}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{roomsWord(p.rooms.length)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <CardShell title={LABEL} href={LIST_HREF} scroll>
      <div className="space-y-3 px-5 pb-4">
        {data.properties.map((p) => (
          <section key={p.propertyId} aria-label={p.propertyName}>
            <Link
              href={roomsHref(p.propertyId)}
              className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.propertyName}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden />
            </Link>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {p.rooms.map((r) => (
                <li key={r.id}>
                  <Link
                    href={roomsHref(p.propertyId, r.id)}
                    className="block rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {remaining > 0 && (
          <Link
            href={LIST_HREF}
            className="block rounded-md py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
          >
            +{remaining} more
          </Link>
        )}
      </div>
    </CardShell>
  )
}
