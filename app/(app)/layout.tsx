import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Sidebar, MobileSidebarTrigger } from "@/components/sidebar"
import { UserMenu } from "@/components/user-menu"
import { NotificationBell } from "@/components/notification-bell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
          <MobileSidebarTrigger />
          <div className="flex items-center gap-2 ml-auto">
            <NotificationBell unreadCount={unreadCount} />
            <UserMenu name={session.user.name ?? "User"} email={session.user.email ?? ""} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
