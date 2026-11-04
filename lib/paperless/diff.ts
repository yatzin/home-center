import { createHash } from "node:crypto"
import type { PaperlessDoc, PaperlessVersion } from "./client"

export type SyncRow = {
  paperlessId: number
  paperlessVersionId: number | null
  paperlessChecksum: string | null
  paperlessTextHash: string | null
  paperlessLinkStatus: "OK" | "MISSING" | null
}

export type SyncAction =
  | { kind: "UNCHANGED" }
  | { kind: "REPLACE_FILE"; versionId: number; checksum: string; textHash: string }
  | { kind: "REFRESH_TEXT"; textHash: string }
  | { kind: "CONFIRM_MISSING" }
  | { kind: "RESTORE_LINK" }

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function time(v: PaperlessVersion): number {
  const t = new Date(v.added).getTime()
  return Number.isNaN(t) ? -Infinity : t
}

export function newestVersion(versions: PaperlessVersion[]): PaperlessVersion | undefined {
  let best: PaperlessVersion | undefined
  for (const v of versions) {
    if (!best) {
      best = v
      continue
    }
    const dt = time(v) - time(best)
    if (dt > 0 || (dt === 0 && v.id > best.id) || (Number.isNaN(dt) && v.id > best.id)) best = v
  }
  return best
}

export function planSync(row: SyncRow, remote: PaperlessDoc | undefined): SyncAction {
  if (!remote || remote.deletedAt) return { kind: "CONFIRM_MISSING" }

  const textHash = hashText(remote.content)
  const newest = newestVersion(remote.versions)
  if (
    newest &&
    (row.paperlessVersionId !== newest.id || row.paperlessChecksum !== newest.checksum)
  ) {
    return { kind: "REPLACE_FILE", versionId: newest.id, checksum: newest.checksum, textHash }
  }
  if (row.paperlessTextHash !== textHash) return { kind: "REFRESH_TEXT", textHash }
  if (row.paperlessLinkStatus === "MISSING") return { kind: "RESTORE_LINK" }
  return { kind: "UNCHANGED" }
}
