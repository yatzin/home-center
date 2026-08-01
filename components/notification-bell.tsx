"use client"

import Link from "next/link"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notifications"
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
      aria-label={`${unreadCount} unread notifications`}
    >
      <Bell className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] font-semibold leading-none flex items-center justify-center ring-2 ring-card"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  )
}
