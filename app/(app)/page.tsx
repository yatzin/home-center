import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { FreshStartCard } from "@/components/dashboard/fresh-start-card"
import { CustomizedDashboard } from "@/components/dashboard/customized-dashboard"
import { DashboardEditProvider, EditCorner } from "@/components/dashboard/canvas/edit-context"

export default async function DashboardPage() {
  const session = await auth()
  const isAdmin = session?.user.role === "ADMIN"

  const empty = await householdIsEmpty()
  // No page header: the greeting is a Text card in the layout (the default
  // layout's first row), so admins can reword, restyle, move or remove it.
  // The grid starts at the top of the page. Admins get a corner tab in the page's
  // top-right (EditCorner) that starts editing; it hides while editing.
  return (
    <DashboardEditProvider>
      {isAdmin && <EditCorner />}
      {/* -mt-4.5 cancels 18px of the page's 24px top padding, leaving 6px above the grid. */}
      <div className="-mt-4.5 space-y-6">
        {empty && isAdmin && <FreshStartCard />}
        <CustomizedDashboard isAdmin={isAdmin} userName={session?.user?.name ?? null} />
      </div>
    </DashboardEditProvider>
  )
}

// Unfiltered, so data hidden by a feature toggle or the property filter still counts.
async function householdIsEmpty() {
  const counts = await Promise.all([
    prisma.property.count(),
    prisma.vehicle.count(),
    prisma.equipment.count(),
    prisma.person.count(),
    prisma.serviceRecord.count(),
  ])
  return counts.every((n) => n === 0)
}
