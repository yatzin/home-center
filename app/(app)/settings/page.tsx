import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { UserManagement } from "@/components/settings/user-management"

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to access settings.</p>
      </div>
    )
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <UserManagement users={users} currentUserId={session.user.id} />
    </div>
  )
}
