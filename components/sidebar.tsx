"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  LayoutDashboard, Building2, Car, Wrench, ShieldCheck,
  Calendar, Bell, Settings, Menu,
} from "lucide-react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assets/properties", label: "Properties", icon: Building2 },
  { href: "/assets/vehicles", label: "Vehicles", icon: Car },
  { href: "/records", label: "Service Records", icon: Wrench },
  { href: "/warranties", label: "Warranties", icon: ShieldCheck },
  { href: "/maintenance", label: "Maintenance", icon: Calendar },
  { href: "/notifications", label: "Notifications", icon: Bell },
]

const bottomItems = [{ href: "/settings", label: "Settings", icon: Settings }]

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== "/" && pathname.startsWith(href))
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  return (
    <div className="flex flex-col h-full px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">HC</div>
        <span className="font-semibold">HomeCenter</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => <NavLink key={item.href} {...item} onClick={onNavClick} />)}
      </nav>
      <nav className="flex flex-col gap-1 border-t pt-3 mt-3">
        {bottomItems.map((item) => <NavLink key={item.href} {...item} onClick={onNavClick} />)}
      </nav>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-card">
      <SidebarContent />
    </aside>
  )
}

export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors md:hidden">
        <Menu className="h-4 w-4" />
        <span className="sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-56 p-0">
        <SidebarContent onNavClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

