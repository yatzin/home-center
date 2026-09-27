// Whether the docked assistant panel is open, and how wide — remembered per
// browser in localStorage. Storage can be missing or throw; that just means the
// defaults.

export const DEFAULT_PANEL_WIDTH = 400
export const MIN_PANEL_WIDTH = 320
export const MAX_PANEL_WIDTH = 640
const KEY = "hc.chat.panel"

export type PanelPrefs = { open: boolean; width: number }
type PrefStorage = Pick<Storage, "getItem" | "setItem"> | null

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

export function readPanelPrefs(storage: PrefStorage): PanelPrefs {
  try {
    const raw = storage?.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<PanelPrefs>) : {}
    return { open: v.open === true, width: clampPanelWidth(Number(v.width ?? DEFAULT_PANEL_WIDTH)) }
  } catch {
    return { open: false, width: DEFAULT_PANEL_WIDTH }
  }
}

export function writePanelPrefs(storage: PrefStorage, prefs: PanelPrefs) {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // blocked or full — the panel still works for this page view
  }
}
