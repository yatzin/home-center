// The item lists the card settings dialog picks from (server only). Ids and
// names only, sorted by name, so they are cheap to pass to the client. Loaded
// for admins only (only they can open the dialog).
import { prisma } from "@/lib/prisma"
import type { Features } from "@/lib/features"
import type { ConfigItemOptions, ItemOption } from "./config-form"

const byName = (a: ItemOption, b: ItemOption) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)

export async function loadConfigItemOptions(features: Features): Promise<ConfigItemOptions> {
  const select = { id: true, name: true } as const
  const [properties, vehicles, equipment, people] = await Promise.all([
    prisma.property.findMany({ select }),
    prisma.vehicle.findMany({ select }),
    prisma.equipment.findMany({ select }),
    // People are health data: never sent to the page with Health off.
    features.health ? prisma.person.findMany({ select }) : Promise.resolve([]),
  ])
  return {
    PROPERTY: properties.sort(byName),
    VEHICLE: vehicles.sort(byName),
    EQUIPMENT: equipment.sort(byName),
    PERSON: people.sort(byName),
  }
}
