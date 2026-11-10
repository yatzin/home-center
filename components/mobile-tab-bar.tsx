"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Building2, Calendar, Ellipsis, LayoutDashboard, Wrench } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SidebarContent, type NavProps } from "@/components/sidebar"
import { cn } from "@/lib/utils"

// The phone's navigation: five thumb-reach tabs along the bottom, "More" opening the full
// menu. Phones only (md:hidden), so the desktop sidebar and header are not affected.

const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/assets", label: "Assets", icon: Building2 },
  { href: "/maintenance", label: "Maintenance", icon: Calendar },
  { href: "/records", label: "Records", icon: Wrench },
] as const

const tabClass = "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"

export function MobileTabBar({ footer, moreDot = false, ...nav }: NavProps & { footer?: React.ReactNode; /** Something waiting in a screen under More (Intake files, notifications). */ moreDot?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  // "More" is lit when the page is somewhere the four tabs don't cover.
  const inMore = !TABS.some((t) => isActive(t.href))

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex shrink-0 border-t border-border/60 bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(tabClass, active ? "text-primary" : "text-muted-foreground active:text-foreground")}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(tabClass, inMore ? "text-primary" : "text-muted-foreground active:text-foreground")}
        >
          <span className="relative">
            <Ellipsis className="h-5 w-5" strokeWidth={inMore ? 2 : 1.5} aria-hidden="true" />
            {moreDot && <span aria-hidden="true" className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />}
          </span>
          More{moreDot && <span className="sr-only">, something is waiting</span>}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] md:hidden" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarContent {...nav} onNavClick={() => setOpen(false)} />
          </div>
          {footer && <div className="shrink-0 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">{footer}</div>}
        </SheetContent>
      </Sheet>
    </>
  )
}
