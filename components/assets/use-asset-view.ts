"use client"

import { useCallback, useState } from "react"
import {
  assetViewCookieName,
  ASSET_VIEW_COOKIE_MAX_AGE,
  type AssetView,
  type AssetViewKey,
} from "@/lib/asset-view"

// Seeded from the cookie the server already read, so switching is instant and
// no effect has to correct the layout after hydration.
export function useAssetView(key: AssetViewKey, initial: AssetView) {
  const [view, setView] = useState<AssetView>(initial)

  const change = useCallback(
    (next: AssetView) => {
      setView(next)
      document.cookie = `${assetViewCookieName(key)}=${next}; Path=/; Max-Age=${ASSET_VIEW_COOKIE_MAX_AGE}; SameSite=Lax`
    },
    [key]
  )

  return [view, change] as const
}
