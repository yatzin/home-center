import { rm } from "fs/promises"
import { resolveUploadPath } from "@/lib/upload-path"

// Not a server action module (only async functions may live in one of those),
// so this sits beside resolveUploadPath instead.

/// Best-effort delete of an upload path, always called after its DB row is
/// already gone. A failure here (locked file, already missing, permissions)
/// must never surface as a failed request when the record itself was deleted
/// successfully — so this logs and swallows rather than throwing.
export async function removeUploadDir(...segments: string[]): Promise<void> {
  try {
    await rm(resolveUploadPath(...segments), { recursive: true, force: true })
  } catch (err) {
    console.error("Failed to remove upload path", segments, err)
  }
}
