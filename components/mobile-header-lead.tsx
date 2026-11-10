"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { BrandIcon } from "@/components/brand-icon"

const LISTS: Record<string, { label: string; href: string }> = {
  properties: { label: "Properties", href: "/assets/properties" },
  vehicles: { label: "Vehicles", href: "/assets/vehicles" },
  equipment: { label: "Equipment", href: "/assets/equipment" },
  people: { label: "People", href: "/assets/people" },
}

/**
 * The top-left of the phone header: the mark on top-level screens, and a labelled back button
 * on an asset's own page. Phones only; the desktop header has neither.
 */
export function MobileHeaderLead() {
  const pathname = usePathname()
  const router = useRouter()
  const detail = pathname.match(/^\/assets\/([a-z]+)\/[^/]+/)
  const list = detail ? LISTS[detail[1]] : undefined

  if (!list) {
    return (
      <Link href="/" aria-label="HomeCenter home" className="shrink-0 rounded-lg md:hidden">
        <BrandIcon className="h-8 w-8" />
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(list.href))}
      className="relative -ml-1 inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg pr-2 text-sm font-medium text-primary active:bg-muted md:hidden"
      aria-label={`Back to ${list.label}`}
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      {list.label}
    </button>
  )
}
