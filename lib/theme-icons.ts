import { themeNames } from "@/lib/themes"

/** Remembers the chosen theme for the install manifest, which the server builds without seeing localStorage. */
export const THEME_COOKIE = "hc-theme"

/** A cookie value that is a known theme id, else Spruce. */
export function iconThemeId(value: string | undefined): string {
  return value && themeNames.includes(value) ? value : "light"
}

/** The install icons for a theme (files made by scripts/make-brand-icons.ts). */
export function installIcons(id: string) {
  return [
    { src: `/icons/theme/${id}-192.png`, sizes: "192x192", type: "image/png" },
    { src: `/icons/theme/${id}-512.png`, sizes: "512x512", type: "image/png" },
    { src: `/icons/theme/${id}-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" as const },
  ]
}
