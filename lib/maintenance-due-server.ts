import { prisma } from "@/lib/prisma"
import type { MileageIndex } from "@/lib/maintenance-due"

/** Every known odometer reading, keyed by vehicle id. */
export async function loadVehicleMileage(): Promise<MileageIndex> {
  const vehicles = await prisma.vehicle.findMany({
    where: { currentMileage: { not: null } },
    select: { id: true, currentMileage: true },
  })
  return new Map(vehicles.map((v) => [v.id, v.currentMileage!]))
}
