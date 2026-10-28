// Deep links that open one maintenance schedule's or warranty's edit dialog.
// An item is edited on its asset's page: `?tab=<tab>&open=<id>` shows the tab
// and opens the item's form (MaintenanceList / WarrantyList read `open`). The
// same links are used by the Maintenance and Warranties pages. Pure TS.
import type { AssetType } from "@/app/generated/prisma/client"
import { assetHref } from "@/lib/assets"

/** The tab of an asset page that lists its maintenance schedules (a person's are "Reminders"). */
const maintenanceTab = (assetType: AssetType) => (assetType === "PERSON" ? "reminders" : "maintenance")

const openHref = (assetType: AssetType, assetId: string, tab: string, id: string) =>
  `${assetHref(assetType, assetId)}?tab=${tab}&open=${encodeURIComponent(id)}`

/** The asset page with the schedule's edit dialog open. */
export function maintenanceEditHref(assetType: AssetType, assetId: string, scheduleId: string): string {
  return openHref(assetType, assetId, maintenanceTab(assetType), scheduleId)
}

/** The asset page with the warranty's edit dialog open. */
export function warrantyEditHref(assetType: AssetType, assetId: string, warrantyId: string): string {
  return openHref(assetType, assetId, "warranties", warrantyId)
}

/**
 * The row an `open` parameter names, from the rows the page already loaded
 * (and so already scoped to what the viewer may see). Anything else, such as
 * an unknown, deleted or repeated id, opens nothing. The parameter is never
 * used for anything but picking one of these rows.
 */
export function findOpenRow<T extends { id: string }>(rows: readonly T[], openId: unknown): T | undefined {
  return typeof openId === "string" && openId !== "" ? rows.find((r) => r.id === openId) : undefined
}

/**
 * A location search string ("?tab=x&open=y") without `open`, so a reload or
 * the back button does not open the dialog again; null when it has none.
 */
export function withoutOpenParam(search: string): string | null {
  const params = new URLSearchParams(search)
  if (!params.has("open")) return null
  params.delete("open")
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}
