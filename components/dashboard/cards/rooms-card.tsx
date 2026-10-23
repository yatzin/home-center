"use client"

import Link from "next/link"
import { ChevronRight, DoorOpen } from "lucide-react"
import type { RoomsCardData } from "@/lib/dashboard/loaders"
import { CardMessage, CardShell } from "./card-shell"
import { CountTile, CountWithList } from "./count-card"
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

function RoomsTile({ data, className }: { data: Extract<RoomsCardData, { missing: false }>; className?: string }) {
  const only = data.single ? data.properties[0] : undefined
  return <CountTile label={LABEL} icon={DoorOpen} href={only ? roomsHref(only.propertyId) : LIST_HREF} count={data.total} className={className} />
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

  if (tier === TIER_COUNT) return <RoomsTile data={data} className="h-full" />

  if (data.total === 0) {
    return (
      <CardShell title={LABEL} href={LIST_HREF}>
        <CardMessage icon={DoorOpen} message="No rooms yet" action={{ href: LIST_HREF, label: "Add rooms to a property" }} />
      </CardShell>
    )
  }

  if (tier === TIER_PROPERTIES) {
    return (
      <CountWithList
        tile={{
          label: LABEL,
          icon: DoorOpen,
          href: data.single && data.properties[0] ? roomsHref(data.properties[0].propertyId) : LIST_HREF,
          count: data.total,
          className: "py-3",
        }}
        scroll
      >
        <ul className="space-y-0.5 px-3 py-1.5">
          {data.properties.map((p) => (
            <li key={p.propertyId}>
              <Link
                href={roomsHref(p.propertyId)}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.propertyName}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{roomsWord(p.roomCount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CountWithList>
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
            <ul className="mt-1 flex flex-wrap items-center gap-1.5">
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
              {p.roomCount > p.rooms.length && (
                <li className="text-xs text-muted-foreground tabular-nums">
                  {p.rooms.length > 0 ? `+${p.roomCount - p.rooms.length} more` : roomsWord(p.roomCount)}
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </CardShell>
  )
}
