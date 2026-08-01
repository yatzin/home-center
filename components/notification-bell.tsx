"use client"

import Link from "next/link"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
      aria-label={`${unreadCount} unread notifications`}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  )
}
