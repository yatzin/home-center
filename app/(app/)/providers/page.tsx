import { prisma } from "@/lib/prisma"
import { ProvidersTable } from "@/components/providers/providers-table"
import { cents } from "@/lib/costs"

export default async function ProvidersPage() {
  const [providers, visits] = await Promise.all([
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
    prisma.serviceRecord.groupBy({
      by: ["providerId"],
      where: { providerId: { not: null } },
      _count: { _all: true },
      _sum: { cost: true },
    }),
  ])

  const stats = Object.fromEntries(
    visits.map((v) => [v.providerId!, { visits: v._count._all, spend: cents(v._sum.cost ?? 0) }])
  )

  return (
    <div className="space-y-6">
      <ProvidersTable providers={providers} stats={stats} />
    </div>
  )
}
