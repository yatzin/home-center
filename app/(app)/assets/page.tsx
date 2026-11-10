import Link from "next/link"
import type { Metadata } from "next"
import { Building2, Car, ChevronRight, HeartPulse, Refrigerator, Stethoscope, Umbrella } from "lucide-react"
import { loadFeatures } from "@/lib/features-server"

export const metadata: Metadata = { title: "Assets" }

// The phone's Assets tab (components/mobile-tab-bar.tsx) lands here: one place to reach every kind
// of asset. The same pages are in the side menu on a larger screen.
const GROUPS = [
  {
    title: "Home",
    items: [
      { href: "/assets/properties", label: "Properties", hint: "Homes and land", icon: Building2 },
      { href: "/assets/vehicles", label: "Vehicles", hint: "Cars, boats and engines", icon: Car },
      { href: "/assets/equipment", label: "Equipment", hint: "Appliances, HVAC and tools", icon: Refrigerator },
      { href: "/insurance", label: "Insurance", hint: "Policies and coverage", icon: Umbrella },
    ],
  },
  {
    title: "Health",
    health: true,
    items: [
      { href: "/assets/people", label: "People", hint: "Everyone in the household", icon: HeartPulse },
      { href: "/providers", label: "Providers", hint: "Doctors, dentists and clinics", icon: Stethoscope },
    ],
  },
]

export default async function AssetsPage() {
  const { health } = await loadFeatures()
  const groups = GROUPS.filter((g) => !g.health || health)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Assets</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Everything HomeCenter keeps track of.</p>
      </div>

      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`assets-${group.title}`} className="space-y-2">
          <h2 id={`assets-${group.title}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(({ href, label, hint, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
