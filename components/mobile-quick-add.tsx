"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Camera, Plus, Wrench } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

/**
 * A floating "+" above the tab bar: the two things people do on the go (photograph a receipt,
 * log a service) one tap away from anywhere. Phones only, and not on the screens that are
 * already about adding.
 */
export function MobileQuickAdd({ showIntake }: { showIntake: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [away, setAway] = useState(false)

  // Slides off while the page scrolls down (it would sit over the content), back on scrolling up.
  useEffect(() => {
    const main = document.querySelector("main")
    if (!main) return
    let last = main.scrollTop
    const onScroll = () => {
      const now = main.scrollTop
      if (Math.abs(now - last) < 8) return
      setAway(now > last && now > 80)
      last = now
    }
    main.addEventListener("scroll", onScroll, { passive: true })
    return () => main.removeEventListener("scroll", onScroll)
  }, [pathname])

  if (pathname.startsWith("/intake") || pathname.startsWith("/chat")) return null

  const actions = [
    ...(showIntake ? [{ href: "/intake", label: "Scan a receipt or photo", hint: "Take a picture; HomeCenter reads it", icon: Camera }] : []),
    { href: "/records?add=1", label: "Add a service record", hint: "Repairs, maintenance, visits", icon: Wrench },
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add"
        aria-haspopup="dialog"
        className={`fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/20 transition-all duration-200 active:scale-95 motion-reduce:transition-none md:hidden ${away ? "pointer-events-none translate-y-24 opacity-0" : ""}`}
      >
        <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
          <SheetTitle className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick add</SheetTitle>
          <ul>
            {actions.map(({ href, label, hint, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 active:bg-muted">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
