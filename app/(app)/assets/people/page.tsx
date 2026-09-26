import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PeopleList } from "@/components/people/people-list"
import { assetViewCookieName, parseAssetView } from "@/lib/asset-view"

export default async function PeoplePage() {
  // Start of today in UTC — dates are stored as UTC midnight, and a medication
  // counts as active through the whole of its end date (lib/health.ts).
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [people, providers, cookieStore] = await Promise.all([
    prisma.person.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            conditions: { where: { status: { not: "RESOLVED" } } },
            medications: { where: { OR: [{ endDate: null }, { endDate: { gte: today } }] } },
            allergies: { where: { severity: "SEVERE" } },
          },
        },
      },
    }),
    prisma.provider.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    cookies(),
  ])

  const initialView = parseAssetView(cookieStore.get(assetViewCookieName("people"))?.value)

  return (
    <div className="space-y-6">
      <PeopleList people={people} providers={providers} initialView={initialView} />
    </div>
  )
}
