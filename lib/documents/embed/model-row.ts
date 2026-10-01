// What the Settings model table shows for one row. Pure, so the client
// component can use it without touching anything server-side.

export type ModelRowState = "downloading" | "in-use" | "in-use-missing" | "installed" | "builtin-missing" | "available"

export function modelRowState(m: { active: boolean; installed: boolean; builtIn: boolean }, downloading: boolean): ModelRowState {
  if (downloading) return "downloading"
  // The built-in model ships with the app and can't be downloaded from Settings.
  if (!m.installed && m.builtIn) return "builtin-missing"
  if (m.active) return m.installed ? "in-use" : "in-use-missing"
  return m.installed ? "installed" : "available"
}
