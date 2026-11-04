import { MAX_NAME_LENGTH, NAME_MESSAGE } from "@/lib/input-limits"

// The display name of an uploaded file (Attachment.originalName). The stored
// file is named by UUID, so renaming never touches the disk.

// Path separators and control characters: the name ends up in download names and lists.
const FORBIDDEN = /[\\/\u0000-\u001f\u007f]/

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot) : ""
}

/**
 * The name to save, or an error. The original extension is kept: a name typed
 * without it gets it back, so "Invoice" on "scan.pdf" becomes "Invoice.pdf".
 */
export function cleanAttachmentName(input: string, current: string): { name: string } | { error: string } {
  const typed = input.trim()
  if (!typed) return { error: "Name is required." }
  if (FORBIDDEN.test(typed)) return { error: "Name can't contain slashes or control characters." }
  const ext = extensionOf(current)
  const name = ext && !typed.toLowerCase().endsWith(ext.toLowerCase()) ? `${typed}${ext}` : typed
  if (name.length > MAX_NAME_LENGTH) return { error: NAME_MESSAGE }
  return { name }
}
