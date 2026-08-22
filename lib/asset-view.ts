// Layout preference for the asset list pages. Shared by the server components
// (which read the cookie so the first paint is already correct) and the client
// toggle (which writes it).

export const ASSET_VIEWS = ["cards", "compact", "list"] as const
export type AssetView = (typeof ASSET_VIEWS)[number]

export const DEFAULT_ASSET_VIEW: AssetView = "cards"

export type AssetViewKey = "properties" | "vehicles" | "equipment"

export function assetViewCookieName(key: AssetViewKey) {
  return `hc-view-${key}`
}

export function parseAssetView(value: string | undefined | null): AssetView {
  return (ASSET_VIEWS as readonly string[]).includes(value ?? "") ? (value as AssetView) : DEFAULT_ASSET_VIEW
}

// One year. Not security-sensitive — a layout choice — so it stays readable by
// the client script that sets it.
export const ASSET_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
