import type { MetadataRoute } from "next"
import { cookies } from "next/headers"
import { BRAND_COLORS } from "@/lib/brand-icon-colors"
import { THEME_COOKIE, iconThemeId, installIcons } from "@/lib/theme-icons"

// Lets "Add to Home Screen" launch HomeCenter as a standalone app. The icons
// follow the theme chosen in the header (remembered in a cookie by
// components/theme-icons.tsx); the files come from scripts/make-brand-icons.ts.
// proxy.ts leaves this route and /icons out of the login redirect so the browser
// can fetch them before anyone is signed in.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // No cookie (first visit, or outside a request): Spruce.
  const chosen = await (async () => {
    try {
      return (await cookies()).get(THEME_COOKIE)?.value
    } catch {
      return undefined
    }
  })()
  const id = iconThemeId(chosen)
  const colors = BRAND_COLORS[id]
  return {
    name: "HomeCenter",
    short_name: "HomeCenter",
    description: "Track and manage your homes and vehicles",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: colors.background,
    theme_color: colors.tile,
    icons: installIcons(id),
  }
}
