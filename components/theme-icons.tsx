"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { BRAND_COLORS } from "@/lib/brand-icon-colors"
import { brandSvgDataUri } from "@/lib/brand-icon"
import { THEME_COOKIE } from "@/lib/theme-icons"

function setLink(rel: string, href: string, type?: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-theme-icon]`)
  if (!link) {
    link = document.createElement("link")
    link.rel = rel
    link.dataset.themeIcon = ""
    document.head.appendChild(link)
  }
  if (type) link.type = type
  link.removeAttribute("sizes")
  link.href = href
}

/**
 * Keeps the browser tab's icon and the Home Screen icon on the chosen theme. The
 * tab icon is redrawn on the spot; the Home Screen icon is read when the app is
 * added, so the link points at the current theme's file and the choice is also
 * stored in a cookie for the install manifest (app/manifest.ts).
 */
export function ThemeIcons() {
  const { theme } = useTheme()
  useEffect(() => {
    const id = theme && BRAND_COLORS[theme] ? theme : "light"
    // Placed after the framework's own icon links so it wins.
    setLink("icon", brandSvgDataUri(BRAND_COLORS[id]), "image/svg+xml")
    setLink("apple-touch-icon", `/icons/theme/${id}-apple.png`)
    // The browser toolbar / status bar colour on a phone follows the theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = BRAND_COLORS[id].background))
    document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
  }, [theme])
  return null
}
