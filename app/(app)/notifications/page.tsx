import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, Wrench, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const typeIcon: Record<string, React.ElementType> = {
  MAINTENANCE_DUE: Wrench,
  WARRANTY_EXPIRING: ShieldCheck,
  CUSTOM: Bell,
}

export default async function NotificationsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const unread = notifications.filter((n) => !n.isRead).length

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <Button variant="outline" size="sm" type="submit">Mark all read</Button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = typeIcon[n.type] ?? Bell
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                  !n.isRead && "bg-primary/5 border-primary/20"
                )}
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("text-sm font-medium", !n.isRead && "text-foreground")}>{n.title}</p>
                    {!n.isRead && <Badge variant="secondary" className="h-4 px-1.5 text-xs">New</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.isRead && (
                  <form action={markNotificationRead.bind(null, n.id)}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" type="submit">
                      Dismiss
                    </Button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
