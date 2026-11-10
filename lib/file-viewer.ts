// Opening an attachment. In a browser a file opens in a new tab. An installed app
// has no tabs, so the file would replace the app with a bare document that has no
// way back; there, on a phone or tablet, files open in the in-app viewer (app/view).

export const VIEWER_PATH = "/view"

const FILES_PREFIX = "/api/files/"

/**
 * An upload URL that is safe to show: one of our own /api/files paths, with an optional #page=N.
 * Anything else (another site, a path that climbs out, a query string) is refused, so the
 * viewer can't be pointed at arbitrary URLs.
 */
export function parseViewerSrc(src: string | null | undefined): { path: string; page: number | null } | null {
  if (!src) return null
  const [path, hash = ""] = src.split("#", 2)
  if (!path.startsWith(FILES_PREFIX) || path.length === FILES_PREFIX.length) return null
  // A backslash, a query string, "..", "//" or an encoded dot, slash or backslash.
  const rest = path.slice(FILES_PREFIX.length - 1)
  if (rest.includes(String.fromCharCode(92)) || /[?]|\.\.|\/\/|%2e|%2f|%5c/i.test(rest)) return null
  const page = hash.match(/(?:^|&)page=(\d{1,5})(?:&|$)/)
  return { path, page: page ? Number(page[1]) : null }
}

/** The viewer's address for a file. `fileHref` may end in #page=N for a PDF. */
export function viewerHref(fileHref: string, name: string): string {
  return `${VIEWER_PATH}?src=${encodeURIComponent(fileHref)}&name=${encodeURIComponent(name)}`
}

export type FileKind = "image" | "pdf" | "other"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"])

export function fileKind(path: string): FileKind {
  const dot = path.lastIndexOf(".")
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase()
  if (ext === ".pdf") return "pdf"
  return IMAGE_EXTENSIONS.has(ext) ? "image" : "other"
}

type Env = {
  matchMedia: (query: string) => { matches: boolean }
  navigator: object
}

/**
 * True only for an installed app (standalone window) on a touch device. A desktop browser,
 * a phone's browser and an app installed on a PC all keep opening files in a new tab/window.
 */
export function inInstalledTouchApp(env: Env): boolean {
  const standalone = env.matchMedia("(display-mode: standalone)").matches || (env.navigator as { standalone?: boolean }).standalone === true
  return standalone && env.matchMedia("(pointer: coarse)").matches
}
