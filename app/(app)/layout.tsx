import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Sidebar, MobileSidebarTrigger } from "@/components/sidebar"
import { UserMenu } from "@/components/user-menu"
import { NotificationBell } from "@/components/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { resolveNotificationHrefs } from "@/lib/notification-links"
import { loadLlmStatus } from "@/lib/llm/config"
import { ChatProvider } from "@/components/chat/chat-provider"
import { ChatDock, ChatToggle } from "@/components/chat/chat-panel"
import packageJson from "@/package.json"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const [notifications, llm] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    loadLlmStatus(),
  ])
  const hrefs = await resolveNotificationHrefs(notifications)
  const notificationItems = notifications.map((n) => ({ ...n, href: hrefs.get(n.id) ?? "/notifications" }))
  const isAdmin = session.user.role === "ADMIN"
  // Admins see the entry points even when it's off, so they can find the setup —
  // unless it's been explicitly hidden.
  const showAssistant = !llm.hidden && (llm.available || isAdmin)

  return (
    <ChatProvider userId={session.user.id} available={llm.available} isAdmin={isAdmin} model={llm.model}>
      <div className="flex h-svh overflow-hidden">
        <Sidebar showAssistant={showAssistant} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card/80 backdrop-blur-sm px-4">
            <MobileSidebarTrigger showAssistant={showAssistant} />
            <div className="flex items-center gap-2 ml-auto">
              <ThemeToggle />
              {showAssistant && <ChatToggle />}
              <NotificationBell notifications={notificationItems} />
              <UserMenu name={session.user.name ?? "User"} email={session.user.email ?? ""} />
            </div>
          </header>
          {/* The page and the docked assistant sit side by side; opening the assistant narrows the page. */}
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
              <footer className="shrink-0 border-t border-border/60 px-4 py-2 text-center text-xs text-muted-foreground">
                HomeCenter &middot; v{packageJson.version}
              </footer>
            </div>
            {showAssistant && <ChatDock />}
          </div>
        </div>
      </div>
    </ChatProvider>
  )
}
