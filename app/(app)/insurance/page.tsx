import { prisma } from "@/lib/prisma"
import { InsuranceList } from "@/components/insurance/insurance-list"

export default async function InsurancePage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>
}) {
  const { open } = await searchParams
  const [policies, people] = await Promise.all([
    prisma.insurancePolicy.findMany({
      include: {
        members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
      orderBy: [{ kind: "asc" }, { carrier: "asc" }],
    }),
    prisma.person.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <InsuranceList policies={policies} people={people} openId={open} />
    </div>
  )
}
